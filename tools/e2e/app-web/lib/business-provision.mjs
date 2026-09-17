/**
 * Provision a generic synthetic Sandbox Business that can sign in with @handle +
 * PIN — the canonical onboarding path, no DB writes, no founder/DOA, no backdoor
 * (APP-BANZAMI-WEB-BUSINESS-001 §88/§124):
 *
 *   submit application (public)
 *     → upload the 2 required KYB docs (presigned R2 → PUT → confirm)
 *       → approve (internal key) → activation_token
 *         → activation/complete {token, pin}  (sets the PIN)
 *           → auth/token {handle, pin} now succeeds.
 *
 * Everything runs on the VM via `docker exec` into the gateway container (public
 * routes on :8080; the internal approve uses the container's own INTERNAL_API_KEY
 * from /proc/1/environ). The R2 PUT runs on the VM too.
 */
import { execFileSync } from 'node:child_process';

const VM = process.env.BZ_VM ?? 'root@217.160.9.248';
const sshOut = (cmd) => execFileSync('ssh', ['-o', 'ConnectTimeout=30', VM, cmd], { encoding: 'utf8', maxBuffer: 8 << 20 });

/**
 * @returns {Promise<{handle:string, pin:string, merchantId:string, applicationId:string}>}
 */
export async function provisionBusiness({ handlePrefix = 'e2ebiz', pin = '481516' } = {}) {
  const handle = `${handlePrefix}${Date.now().toString(36)}`.toLowerCase().slice(0, 28);
  const out = sshOut(`
set -uo pipefail
GW=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-api-gateway-staging')
IK=$(docker exec "$GW" sh -c "tr '\\0' '\\n' < /proc/1/environ | sed -n 's/^INTERNAL_API_KEY=//p'")
H="${handle}"; PIN="${pin}"
jval(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s)["'$1'"]||"")+"")}catch{process.stdout.write("")}})'; }

# 1. Submit application (public).
APP=$(printf '{"desired_handle":"%s","business_name":"E2E %s","category":"retail","email":"%s@synthetic.test","phone":"+244900000000","nif":"5417000000","country":"AO","province":"Luanda","municipality":"Luanda","city":"Luanda","address":"Luanda, Angola","legal_representative":"E2E Rep","representative_role":"Director","representative_email":"%s@synthetic.test","representative_phone":"+244900000000","business_activity":"Testing","estimated_volume":"0-100000","terms_accepted":true}' "$H" "$H" "$H" "$H" \\
  | docker exec -i "$GW" curl -s -X POST http://localhost:8080/v1/merchant/applications -H 'Content-Type: application/json' --data @- | jval application_id)
[ -z "$APP" ] && { echo "ERR|submit_failed"; exit 0; }

# 2. Upload the two required KYB documents to R2.
printf '%%PDF-1.4\\n%%minimal synthetic KYB doc\\n' > /tmp/kyb-$H.pdf
SZ=$(stat -c%s /tmp/kyb-$H.pdf)
for DT in BUSINESS_REGISTRATION REPRESENTATIVE_ID; do
  R=$(printf '{"document_type":"%s","filename":"doc.pdf","mime_type":"application/pdf","size_bytes":%s}' "$DT" "$SZ" \\
    | docker exec -i "$GW" curl -s -X POST "http://localhost:8080/v1/merchant/applications/$APP/documents/upload-url" -H 'Content-Type: application/json' --data @-)
  DOC=$(printf '%s' "$R" | jval document_id)
  URL=$(printf '%s' "$R" | jval upload_url)
  [ -z "$URL" ] && { echo "ERR|upload_url_failed:$DT:$R"; exit 0; }
  curl -s -X PUT "$URL" -H 'Content-Type: application/pdf' --data-binary @/tmp/kyb-$H.pdf -o /dev/null
  docker exec "$GW" curl -s -o /dev/null -X POST "http://localhost:8080/v1/merchant/applications/$APP/documents/$DOC/confirm"
done
rm -f /tmp/kyb-$H.pdf

# 3. Approve (internal) → activation token + merchant id.
AP=$(printf '{"reviewed_by":"app-web-business-e2e"}' \\
  | docker exec -i "$GW" curl -s -X POST "http://localhost:8080/internal/v1/merchant-applications/$APP/approve" -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' --data @-)
TOKEN=$(printf '%s' "$AP" | jval activation_token)
MID=$(printf '%s' "$AP" | jval merchant_id)
[ -z "$TOKEN" ] && { echo "ERR|approve_failed:$AP"; exit 0; }

# 4. Set the PIN.
printf '{"token":"%s","pin":"%s"}' "$TOKEN" "$PIN" \\
  | docker exec -i "$GW" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchant/activation/complete -H 'Content-Type: application/json' --data @-

echo "OK|$H|$PIN|$MID|$APP"
`).trim().split('\n').pop();

  if (!out.startsWith('OK|')) throw new Error(`business provisioning failed: ${out}`);
  const [, h, p, merchantId, applicationId] = out.split('|');
  return { handle: h, pin: p, merchantId, applicationId };
}

// Retire a synthetic Business (best-effort, canonical lifecycle) — suspend so its
// receive point/QR fail closed, without deleting any financial history.
export async function retireBusiness(merchantId) {
  if (!merchantId) return;
  try {
    sshOut(`
CORE=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging')
IK=$(docker exec "$CORE" sh -c "tr '\\0' '\\n' < /proc/1/environ | sed -n 's/^INTERNAL_API_KEY=//p'")
docker exec "$CORE" curl -s -o /dev/null -X POST "http://localhost:8081/internal/v1/merchants/${merchantId}/suspend" -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' -d '{"reason":"app-web-business-e2e cleanup"}' || true
`);
  } catch { /* best-effort */ }
}
