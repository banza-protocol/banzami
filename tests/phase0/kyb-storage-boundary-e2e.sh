#!/usr/bin/env bash
# KYB documents land in the Sandbox's own bucket, come back exactly as sent, and
# a file that is not what it claims is refused and removed — on the deployed
# Sandbox, through the applicant's own routes.
#
#   1  a synthetic application (public route, test email domain)
#   2  a signed upload URL — it names banzami-kyb-sandbox, never banzami-kyb-live,
#      and a key under kyb/sandbox/<application>/
#   3  the bytes go to R2 with the signed PUT; confirming reads them back from
#      storage (size and magic bytes) and the document is UPLOADED for review
#   4  the operator's signed read URL returns the same bytes (sha256)
#   5  a file declared as a PDF that is a PNG is refused at confirm, and its
#      object is deleted — the one path by which storage removes a document
#   6  cleanup: the document and then the application (by the run manifest) are
#      rejected through the operator routes. The small valid synthetic PDF stays in the Sandbox
#      bucket as that rejected application's record: documents of a decided
#      application are not deleted by any route, by design.
#
# Runs ON the Sandbox VM. The internal key and the signed URLs (bearer
# capabilities) are never printed — only their host, bucket and key prefix.
set -uo pipefail

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

GW=$(docker ps --format '{{.Names}}' | grep api-gateway-staging | head -1)
IK=$(docker exec "$GW" sh -c 'tr "\0" "\n" < /proc/1/environ | sed -n "s/^INTERNAL_API_KEY=//p"')
[ -n "$GW" ] && [ -n "$IK" ] || { echo "NO_GATEWAY_OR_KEY"; exit 1; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
call(){ # method path body [internal]
  local a=(curl -s -w $'\n%{http_code}' -X "$1" "http://localhost:8080$2" -H 'Content-Type: application/json')
  [ -n "${4:-}" ] && a+=(-H "X-Internal-Key: $IK")
  local r; r=$(printf '%s' "$3" | docker exec -i "$GW" "${a[@]}" --data @- 2>/dev/null)
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(v==null?"":typeof v==="object"?JSON.stringify(v):String(v))}catch(e){}})' "$1"; }
# Where a signed URL points, without its signature.
where(){ node -e 'const u=new URL(process.argv[1]);const p=u.pathname.split("/").filter(Boolean);const vh=u.hostname.split(".")[0];const bucket=/r2\.cloudflarestorage\.com$/.test(u.hostname)&&p[0]&&!p[0].startsWith("kyb")?p[0]:vh;process.stdout.write(u.hostname.replace(/^[^.]+\./,"*.")+" bucket="+bucket+" key="+p.slice(p[0]===bucket?1:0,4).join("/"))' "$1"; }

W="$(mktemp -d)"; E2E_ALSO='rm -rf "$W"'
R="$E2E_SHORT"
# A minimal PDF and a minimal PNG, generated here.
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n%%%% kyb boundary %s\n' "$R" > "$W/doc.pdf"
printf '\x89PNG\r\n\x1a\n%s' "not a pdf $R" > "$W/doc.png"
PDF_SHA=$(sha256sum "$W/doc.pdf" | cut -c1-64)

echo "### 1 — a synthetic application"
call POST /v1/merchant/applications "{\"environment\":\"SANDBOX\",\"desired_handle\":\"kyb$R\",\"business_name\":\"E2E KYB $R\",\"category\":\"retail\",\"subcategory\":\"general\",\"email\":\"kyb$R@synthetic.test\",\"phone\":\"+244900000000\",\"nif\":\"5417000000\",\"country\":\"AO\",\"province\":\"Luanda\",\"municipality\":\"Luanda\",\"city\":\"Luanda\",\"address\":\"E2E\",\"address_reference\":\"$R\",\"legal_representative\":\"E2E Harness\",\"representative_role\":\"Director\",\"representative_email\":\"kyb$R@synthetic.test\",\"representative_phone\":\"+244900000000\",\"business_activity\":\"automated assurance\",\"estimated_volume\":\"0-100000\",\"terms_accepted\":true}"
chk APPLICATION_SUBMITTED "$CODE" "201"
APP=$(jget application_id)
e2e_own merchant_application "$APP"
[ -n "$APP" ] || exit 1

echo "### 2 — a signed upload URL for the Sandbox bucket"
call POST "/v1/merchant/applications/$APP/documents/upload-url" "{\"document_type\":\"REPRESENTATIVE_ID\",\"filename\":\"id-$R.pdf\",\"mime_type\":\"application/pdf\",\"size_bytes\":$(wc -c < "$W/doc.pdf")}"
chk UPLOAD_URL_ISSUED "$CODE" "201"
DOC=$(jget document_id); URL=$(jget upload_url); HDRS=$(jget headers)
TARGET=$(where "$URL"); echo "  upload → $TARGET"
chk BUCKET_IS_SANDBOX "$(printf '%s' "$TARGET" | grep -o 'bucket=[^ ]*')" "bucket=banzami-kyb-sandbox"
chk NEVER_THE_LIVE_BUCKET "$(printf '%s' "$URL" | grep -c 'banzami-kyb-live')" "0"
chk KEY_UNDER_THIS_APPLICATION "$(printf '%s' "$TARGET" | grep -c "key=kyb/sandbox/$APP")" "1"

echo "### 3 — the bytes go to R2; confirm reads them back"
HARGS=(); while IFS= read -r h; do [ -n "$h" ] && HARGS+=(-H "$h"); done < <(printf '%s' "$HDRS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const [k,v] of Object.entries(JSON.parse(s)||{}))console.log(k+": "+v)}catch(e){}})')
PUT=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${HARGS[@]}" --data-binary "@$W/doc.pdf" "$URL")
chk R2_PUT_ACCEPTED "$PUT" "200"
call POST "/v1/merchant/applications/$APP/documents/$DOC/confirm" '{}'
chk CONFIRMED "$CODE" "200"
chk UPLOADED_FOR_REVIEW "$(jget status)" "UPLOADED"

echo "### 4 — the operator reads back exactly what was sent"
call POST "/internal/v1/merchant-applications/$APP/documents/$DOC/read-url" '{}' internal
chk READ_URL_ISSUED "$CODE" "200"
RURL=$(jget read_url)
echo "  read   → $(where "$RURL")"
chk READ_FROM_SANDBOX_BUCKET "$(where "$RURL" | grep -o 'bucket=[^ ]*')" "bucket=banzami-kyb-sandbox"
chk BYTES_ROUND_TRIP "$(curl -s "$RURL" | sha256sum | cut -c1-64)" "$PDF_SHA"

echo "### 5 — a file that is not what it claims is refused and removed"
call POST "/v1/merchant/applications/$APP/documents/upload-url" "{\"document_type\":\"TAX_ID\",\"filename\":\"nif-$R.pdf\",\"mime_type\":\"application/pdf\",\"size_bytes\":$(wc -c < "$W/doc.png")}"
BAD=$(jget document_id); BURL=$(jget upload_url)
curl -s -o /dev/null -X PUT "${HARGS[@]}" --data-binary "@$W/doc.png" "$BURL"
call POST "/v1/merchant/applications/$APP/documents/$BAD/confirm" '{}'
chk MISLABELLED_REFUSED "$([ "$CODE" -ge 400 ] && [ "$CODE" -lt 500 ] && echo refused || echo "no($CODE)")" "refused"
# The refusal deletes the object and marks the row in the same step
# (merchant_documents.go, refuse): the row is the live evidence it ran.
chk MISLABELLED_ROW_RETIRED "$(e2e_sql "select status || '/' || (deleted_at is not null) from merchant_application_documents where id = '$BAD'")" "REJECTED/true"
call POST "/internal/v1/merchant-applications/$APP/documents/$BAD/read-url" '{}' internal
chk MISLABELLED_NOT_READABLE "$([ "$CODE" -ge 400 ] && echo refused || echo "no($CODE)")" "refused"

echo "### 6 — decided and retired through the operator routes"
call POST "/internal/v1/merchant-applications/$APP/documents/$DOC/reject" "{\"reviewed_by\":\"kyb-storage-boundary-e2e\",\"reason\":\"synthetic assurance fixture\"}" internal
chk DOCUMENT_REJECTED "$([ "$CODE" -lt 300 ] && echo yes || echo "no($CODE)")" "yes"

echo
echo "KYB_STORAGE_BOUNDARY_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
