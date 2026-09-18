-- 0160 — Banzami Validation Studio: the Validation Run domain model.
--
-- BANZAMI-SANDBOX-FULL-VALIDATION-001 Phase C.2.
--
-- This migration creates the durable state a Validation Run is made of. It does
-- NOT start a run, and nothing in this migration can. What it does is make the
-- rules of a run enforceable by the database rather than by whichever process
-- happens to be writing — the same reasoning that puts `raise_ledger_immutable`
-- on the ledger instead of in the posting code.
--
-- Four invariants are enforced here, in the database, and are therefore true
-- regardless of which service, tool or operator is talking to it:
--
--   1. SANDBOX ONLY. `environment` admits exactly one value. A Validation Run
--      against Live is not "discouraged" or "gated in the UI" — it cannot be
--      represented. REAL_LIVE_TESTS_EXECUTED=0 becomes a schema property.
--
--   2. ONE ACTIVE RUN. A partial unique index permits at most one run in
--      QUEUED or RUNNING. Two concurrent runs would spend the same rolling
--      volume budget and interleave in the same nine actors' balances, so
--      concurrency is not a race to be handled — it is a state to be refused.
--
--   3. LEGAL TRANSITIONS ONLY. A trigger rejects any state change not in the
--      declared machine. A terminal state is terminal because UPDATE says so.
--
--   4. APPEND-ONLY HISTORY. `validation_run_events` refuses UPDATE and DELETE.
--      A run's history is evidence; evidence that can be edited is not evidence.
--
-- Grants go to `bl_admin_api_runtime` alone. The control plane (BANZADMIN via
-- admin-api) owns this data. When the execution plane gains a runner it will
-- get its own role and its own narrower grants; giving it access now would be
-- privilege for a caller that does not exist.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Human reference, e.g. BZV-20260918-0001. Stable, quotable in a report.
    run_ref             TEXT        NOT NULL UNIQUE,

    -- Invariant 1: the Studio has one environment and it is not Live.
    environment         TEXT        NOT NULL DEFAULT 'SANDBOX'
                        CHECK (environment = 'SANDBOX'),

    -- What was asked for. The profile lives in quality/validation/profiles.yaml
    -- (versioned as code, reviewed as code); the run pins the exact revision it
    -- was prepared from, so a later profile edit can never silently re-describe
    -- a completed run.
    profile_id          TEXT        NOT NULL,
    profile_version     INTEGER     NOT NULL,
    profile_digest      CHAR(64)    NOT NULL,

    state               TEXT        NOT NULL DEFAULT 'PREPARING'
                        CHECK (state IN ('PREPARING','PREFLIGHT_RUNNING','BLOCKED',
                                         'READY','QUEUED','RUNNING',
                                         'COMPLETED','CANCELLED','ABANDONED')),

    -- Only a COMPLETED run has a verdict, and every COMPLETED run has one.
    verdict             TEXT        CHECK (verdict IN ('PASS','FAIL')),

    -- Who asked. NULL only for a run created by automation with no operator.
    requested_by        UUID        REFERENCES admin_users(id) ON DELETE SET NULL,

    -- Invariant: an idempotent start. The same key returns the same run instead
    -- of creating a second one; scoped to the environment, never global.
    idempotency_key     TEXT,

    -- Execution lease (C.8). A run whose lease expires without a heartbeat is
    -- ABANDONED, not silently RUNNING forever.
    executor_id         TEXT,
    lease_expires_at    TIMESTAMPTZ,
    heartbeat_at        TIMESTAMPTZ,

    cancel_reason       TEXT,

    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT validation_runs_verdict_iff_completed
        CHECK ((state = 'COMPLETED') = (verdict IS NOT NULL)),
    CONSTRAINT validation_runs_ended_iff_terminal
        CHECK ((state IN ('COMPLETED','CANCELLED','ABANDONED')) = (ended_at IS NOT NULL))
);

-- Invariant 2: at most one run may hold the Sandbox at a time.
CREATE UNIQUE INDEX IF NOT EXISTS validation_runs_one_active
    ON validation_runs (environment)
    WHERE state IN ('QUEUED','RUNNING');

CREATE UNIQUE INDEX IF NOT EXISTS validation_runs_idempotency
    ON validation_runs (environment, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS validation_runs_state_requested
    ON validation_runs (state, requested_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Invariant 3 — the state machine, enforced
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION validation_run_transition_is_legal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    legal BOOLEAN;
BEGIN
    IF NEW.state = OLD.state THEN
        RETURN NEW;                         -- a field changed, not the state
    END IF;

    legal := CASE OLD.state
        WHEN 'PREPARING'         THEN NEW.state IN ('PREFLIGHT_RUNNING','CANCELLED')
        WHEN 'PREFLIGHT_RUNNING' THEN NEW.state IN ('READY','BLOCKED','CANCELLED')
        WHEN 'BLOCKED'           THEN NEW.state IN ('PREFLIGHT_RUNNING','CANCELLED')
        WHEN 'READY'             THEN NEW.state IN ('QUEUED','PREFLIGHT_RUNNING','CANCELLED')
        WHEN 'QUEUED'            THEN NEW.state IN ('RUNNING','CANCELLED','ABANDONED')
        WHEN 'RUNNING'           THEN NEW.state IN ('COMPLETED','CANCELLED','ABANDONED')
        ELSE FALSE                          -- COMPLETED / CANCELLED / ABANDONED
    END;

    IF NOT legal THEN
        RAISE EXCEPTION
            'illegal validation run transition: % -> % (run %)',
            OLD.state, NEW.state, OLD.run_ref
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validation_runs_legal_transition ON validation_runs;
CREATE TRIGGER validation_runs_legal_transition
    BEFORE UPDATE ON validation_runs
    FOR EACH ROW EXECUTE FUNCTION validation_run_transition_is_legal();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Invariant 4 — append-only history
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_run_events (
    id          BIGSERIAL PRIMARY KEY,
    run_id      UUID        NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    seq         INTEGER     NOT NULL,
    from_state  TEXT,
    to_state    TEXT        NOT NULL,
    reason      TEXT,
    -- The operator who caused it, where a human did. NULL = the system.
    actor_id    UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
    detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, seq)
);

CREATE OR REPLACE FUNCTION validation_run_events_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'validation_run_events is append-only (attempted % on run %)',
        TG_OP, OLD.run_id
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS validation_run_events_no_change ON validation_run_events;
CREATE TRIGGER validation_run_events_no_change
    BEFORE UPDATE OR DELETE ON validation_run_events
    FOR EACH ROW EXECUTE FUNCTION validation_run_events_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Provenance (C.10) — what the system WAS when the run happened
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_run_provenance (
    run_id      UUID        NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    component   TEXT        NOT NULL,       -- api-gateway-staging, core-api-staging, ...
    revision    TEXT        NOT NULL,       -- deployed commit
    detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, component)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Preflight (C.5) — a run must not start into a broken lab
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_preflights (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- A preflight may stand alone: "is the Sandbox healthy right now?" is a
    -- question worth asking without preparing a run for it.
    run_id       UUID        REFERENCES validation_runs(id) ON DELETE CASCADE,
    environment  TEXT        NOT NULL DEFAULT 'SANDBOX'
                 CHECK (environment = 'SANDBOX'),
    profile_id   TEXT,
    verdict      TEXT        CHECK (verdict IN ('HEALTHY','DEGRADED','UNHEALTHY')),
    requested_by UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at     TIMESTAMPTZ,
    summary      JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS validation_preflights_recent
    ON validation_preflights (started_at DESC);

CREATE TABLE IF NOT EXISTS validation_preflight_checks (
    preflight_id UUID        NOT NULL REFERENCES validation_preflights(id) ON DELETE CASCADE,
    check_group  TEXT        NOT NULL,      -- actors, services, budgets, ...
    check_id     TEXT        NOT NULL,
    status       TEXT        NOT NULL
                 CHECK (status IN ('PASS','WARN','FAIL','SKIPPED','UNAVAILABLE')),
    -- Why, in the operator's words. Never a credential, never a session, never
    -- a key: a preflight proves a secret RESOLVES, it never reads its value.
    detail       TEXT,
    measured     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (preflight_id, check_group, check_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Planned work and its outcome (C.9)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The outcome vocabulary is deliberately wider than pass/fail. A journey that
-- did not run is not a failure, and a journey whose dependency was unreachable
-- is not a product defect. Collapsing those into FAIL is how a validation
-- system starts lying.

CREATE TABLE IF NOT EXISTS validation_run_journeys (
    run_id      UUID        NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    journey_id  TEXT        NOT NULL,
    suite_id    TEXT        NOT NULL,
    outcome     TEXT        NOT NULL DEFAULT 'PLANNED'
                CHECK (outcome IN ('PLANNED','OBSERVED','ASSERTED',
                                   'PASSED','FAILED','SKIPPED','UNAVAILABLE')),
    detail      TEXT,
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    PRIMARY KEY (run_id, journey_id)
);

CREATE INDEX IF NOT EXISTS validation_run_journeys_outcome
    ON validation_run_journeys (run_id, outcome);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Evidence (C.9)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The row is a POINTER plus an integrity claim. Artifacts live in object
-- storage and are streamed on demand under `validation.evidence`; they are
-- never inlined here, because the admin database is not an artifact store and
-- an artifact that fits in a column is an artifact someone will paste.

CREATE TABLE IF NOT EXISTS validation_evidence (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID        NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    journey_id  TEXT,
    kind        TEXT        NOT NULL
                CHECK (kind IN ('HTTP','SCREENSHOT','HAR','LEDGER','WEBHOOK',
                                'LOG','DOCUMENT','MANUAL_USER_VERIFIED')),
    uri         TEXT        NOT NULL,       -- object-storage reference, not content
    sha256      CHAR(64)    NOT NULL,
    redaction   TEXT        NOT NULL DEFAULT 'PENDING'
                CHECK (redaction IN ('PENDING','REDACTED','NOT_REQUIRED')),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS validation_evidence_by_run
    ON validation_evidence (run_id, journey_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants — control plane only
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_admin_api_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE
            validation_runs, validation_run_provenance, validation_preflights,
            validation_preflight_checks, validation_run_journeys, validation_evidence
            TO bl_admin_api_runtime;
        -- Events are append-only by trigger; the grant says the same thing.
        GRANT SELECT, INSERT ON TABLE validation_run_events TO bl_admin_api_runtime;
        GRANT USAGE, SELECT ON SEQUENCE validation_run_events_id_seq TO bl_admin_api_runtime;
    END IF;
END
$$;
