-- Payment receipt semantics: who was paid, and what kind of operation it was.
--
-- A payment-link payment to @doa produced a proof that said
--   Para: —   Método: Transferência Banzami · @banza   Descrição: Payment link: d7c27a5585a4
-- while the phone said "para Sandbox · Doa-Sandbox". The ledger had credited
-- @doa's campaign Wallet Account. Three surfaces, three answers, none of them
-- the ledger's. The causes were at the source, not in the layouts:
--
--   1. A payment-link payment runs as a transfer from the consumer to the
--      Business's wallet, and the receipt path assumed every transfer is P2P:
--      it looked the recipient up among consumers, found nothing, and wrote an
--      empty payee typed 'consumer'.
--   2. The transfer's description was generated ("Payment link: <slug>") and
--      printed as if someone had written it.
--   3. The Business that owns @doa was created by the retired one-click
--      Console setup (0ccc0b8f, removed in 8ae9c3b1) as
--      "Sandbox · <Project name>", and the name travelled to the phone.
--
-- This migration gives the operator one definition of a Business's public
-- identity, and gives a proof the fields to say what the payment was. Nothing
-- financial changes: no amount, ledger entry, proof reference or confirmed
-- instant is touched, and the new trigger makes sure nothing does later.

-- ── 1. A Business's public identity ─────────────────────────────────────────
--
-- The handle is the one the Business OWNS in handle_registry (the same rule the
-- merchant repository uses). The name, in order:
--   - its public profile's display name, the name the Business presents;
--   - otherwise the name it was reviewed under: the business name of the ONE
--     approved application that provisioned the handle it owns — ambiguity
--     (two such applications) resolves to nothing rather than a guess;
--   - otherwise its account name.
-- For @doa there is no profile, and the reviewed application (0D6B88A7) says
-- "Doa"; its account name is the Project-derived "Sandbox · Doa-Sandbox".
-- Nothing here reads a Project, and nothing is special to any Business.
CREATE OR REPLACE VIEW business_public_identities AS
SELECT m.id AS merchant_id,
       owned.handle,
       COALESCE(NULLIF(btrim(p.display_name), ''), reviewed.business_name, m.name) AS display_name
  FROM merchants m
  LEFT JOIN merchant_profiles p ON p.merchant_id = m.id
  LEFT JOIN LATERAL (
        SELECT hr.handle
          FROM handle_registry hr
         WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id
         ORDER BY hr.created_at, hr.handle
         LIMIT 1) owned ON true
  LEFT JOIN LATERAL (
        SELECT min(NULLIF(btrim(a.business_name), '')) AS business_name
          FROM merchant_applications a
         WHERE a.status = 'APPROVED'
           AND a.resolution = 'PROVISIONED_NEW'
           AND owned.handle IS NOT NULL
           AND lower(a.desired_handle) = lower(owned.handle)
        HAVING count(*) = 1) reviewed ON true;

COMMENT ON VIEW business_public_identities IS
    'The public identity of a Business: the @handle it owns (handle_registry) and the name it presents (profile, else the name its handle was approved under, else the account name). The one definition used by receipts, proofs and consumer history.';

-- ── 2. What a proof says the operation was ──────────────────────────────────
ALTER TABLE transaction_proofs
    ADD COLUMN IF NOT EXISTS operation_kind     TEXT,
    ADD COLUMN IF NOT EXISTS channel            TEXT,
    ADD COLUMN IF NOT EXISTS funding_source     TEXT,
    ADD COLUMN IF NOT EXISTS merchant_reference TEXT,
    ADD COLUMN IF NOT EXISTS display_context    TEXT;

-- NULL on a proof issued before this migration until the semantics backfill
-- (services/api-gateway/cmd/backfill-proofs -correct-semantics) derives it.
ALTER TABLE transaction_proofs DROP CONSTRAINT IF EXISTS transaction_proofs_operation_kind_check;
ALTER TABLE transaction_proofs ADD CONSTRAINT transaction_proofs_operation_kind_check
    CHECK (operation_kind IS NULL OR operation_kind IN ('PAYMENT', 'P2P_TRANSFER'));
ALTER TABLE transaction_proofs DROP CONSTRAINT IF EXISTS transaction_proofs_channel_check;
ALTER TABLE transaction_proofs ADD CONSTRAINT transaction_proofs_channel_check
    CHECK (channel IS NULL OR channel IN ('PAYMENT_LINK', 'QR', 'HANDLE'));
ALTER TABLE transaction_proofs DROP CONSTRAINT IF EXISTS transaction_proofs_funding_source_check;
ALTER TABLE transaction_proofs ADD CONSTRAINT transaction_proofs_funding_source_check
    CHECK (funding_source IS NULL OR funding_source IN ('BANZAMI_BALANCE'));
ALTER TABLE transaction_proofs DROP CONSTRAINT IF EXISTS transaction_proofs_merchant_context_length;
ALTER TABLE transaction_proofs ADD CONSTRAINT transaction_proofs_merchant_context_length
    CHECK (char_length(COALESCE(merchant_reference, '')) <= 64
       AND char_length(COALESCE(display_context, '')) <= 120);

COMMENT ON COLUMN transaction_proofs.operation_kind IS
    'PAYMENT (to a Business) | P2P_TRANSFER (to a person). Derived by the operator from the ledger recipient, never from the caller.';
COMMENT ON COLUMN transaction_proofs.channel IS
    'How the payer initiated it: PAYMENT_LINK | QR | HANDLE (@banza address).';
COMMENT ON COLUMN transaction_proofs.funding_source IS
    'Where the money came from: BANZAMI_BALANCE.';
COMMENT ON COLUMN transaction_proofs.merchant_reference IS
    'The Business''s own reference for the payment (e.g. an order or donation number), supplied by the Business and validated. Display context, never financial authority.';
COMMENT ON COLUMN transaction_proofs.display_context IS
    'What the payment was for, in the Business''s public words (e.g. "Vaquinha · <título>"). Supplied by the Business and validated. Display context, never financial authority.';

-- ── 3. A proof's financial facts never change ───────────────────────────────
-- A proof moves forward in status (CONFIRMED → REVERSED) and its display
-- snapshot may be corrected — with the correction recorded below — but the
-- reference people hold, what was paid, and when, are fixed at issue.
CREATE OR REPLACE FUNCTION transaction_proofs_financial_facts_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.proof_reference   IS DISTINCT FROM OLD.proof_reference
    OR NEW.transaction_id    IS DISTINCT FROM OLD.transaction_id
    OR NEW.environment       IS DISTINCT FROM OLD.environment
    OR NEW.amount_minor      IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency          IS DISTINCT FROM OLD.currency
    OR NEW.confirmed_at      IS DISTINCT FROM OLD.confirmed_at
    OR NEW.ledger_reference  IS DISTINCT FROM OLD.ledger_reference
    OR NEW.issued_at         IS DISTINCT FROM OLD.issued_at
    OR NEW.payer_subject_id  IS DISTINCT FROM OLD.payer_subject_id THEN
        RAISE EXCEPTION 'transaction_proofs: the reference, amount, currency, parties'' ledger identity and instants of a proof are immutable (proof %)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_proofs_financial_facts_immutable ON transaction_proofs;
CREATE TRIGGER transaction_proofs_financial_facts_immutable
    BEFORE UPDATE ON transaction_proofs
    FOR EACH ROW EXECUTE FUNCTION transaction_proofs_financial_facts_immutable();

-- ── 4. Every correction of a proof's display snapshot is recorded ───────────
CREATE TABLE IF NOT EXISTS transaction_proof_corrections (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id                 UUID        NOT NULL REFERENCES transaction_proofs(id),
    correction_batch         TEXT        NOT NULL,
    field                    TEXT        NOT NULL,
    previous_value           TEXT,
    corrected_value          TEXT,
    previous_proof_hash      TEXT,
    previous_signature_value TEXT,
    reason                   TEXT        NOT NULL,
    corrected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT transaction_proof_corrections_once UNIQUE (proof_id, correction_batch, field)
);

CREATE INDEX IF NOT EXISTS transaction_proof_corrections_proof_idx
    ON transaction_proof_corrections (proof_id);

COMMENT ON TABLE transaction_proof_corrections IS
    'Append-only record of every correction to a proof''s display snapshot: the field, its previous and corrected value, and the hash and signature the proof carried before. A proof''s reference, amount and instants are never corrected (see transaction_proofs_financial_facts_immutable).';

CREATE OR REPLACE FUNCTION transaction_proof_corrections_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'transaction_proof_corrections is append-only' USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS transaction_proof_corrections_append_only ON transaction_proof_corrections;
CREATE TRIGGER transaction_proof_corrections_append_only
    BEFORE UPDATE OR DELETE ON transaction_proof_corrections
    FOR EACH ROW EXECUTE FUNCTION transaction_proof_corrections_append_only();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
        GRANT SELECT ON business_public_identities TO bl_app_runtime;
        GRANT SELECT, INSERT ON TABLE transaction_proof_corrections TO bl_app_runtime;
    END IF;
END
$$;
