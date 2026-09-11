-- A1-05. A dispute's consumer_id was whatever the caller of POST /v1/disputes
-- asserted: stored, filterable and sent to the Business in dispute.* webhooks
-- as if it were a fact. Disputes are opened on acquiring transactions, which
-- have no Banzami consumer, so from now on a dispute names none. Restitution
-- never used this column (it follows the typed source), so no money depends on
-- it.
--
-- Rows written before this migration keep the value their caller asserted;
-- nothing reads it as authority.
ALTER TABLE disputes ALTER COLUMN consumer_id DROP NOT NULL;
