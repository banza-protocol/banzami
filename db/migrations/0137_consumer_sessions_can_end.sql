-- A consumer's 24-hour token could not be ended: there was no logout and no
-- version to bump, and a suspended consumer kept every token already issued.
-- Tokens now carry the version they were issued under; every authenticated
-- request checks it against this column (and that the consumer is ACTIVE), and
-- signing out bumps it, ending every session the consumer holds.
ALTER TABLE public_api_credentials
    ADD COLUMN token_version INT NOT NULL DEFAULT 0 CHECK (token_version >= 0);
