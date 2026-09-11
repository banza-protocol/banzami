-- One reserved list for the one @banza namespace.
--
-- Two lists existed. Core refused consumer handles from its own RESERVED_HANDLES
-- (bna, bai, bfa, emis, multicaixa, security, compliance, banzai, banzamii, …);
-- the handle registry's SYSTEM rows (0051) — what a Business application checks —
-- held a different, shorter set. A Business could apply for @bna or @emis, held
-- back only by an operator noticing (A3-07). Every reserved name is now a SYSTEM
-- row, which both consumer creation (RA-103: it inserts into the registry) and
-- Business applications meet. None of these was owned on the Sandbox when this
-- was written; a name someone already holds is left to them (DO NOTHING) and
-- reported by the namespace counter.

INSERT INTO handle_registry (handle, owner_type, reserved_reason) VALUES
    ('admin', 'SYSTEM', 'reserved'),
    ('administrator', 'SYSTEM', 'reserved'),
    ('angola', 'SYSTEM', 'reserved'),
    ('angolar', 'SYSTEM', 'reserved'),
    ('api', 'SYSTEM', 'reserved'),
    ('atlantico', 'SYSTEM', 'reserved'),
    ('audit', 'SYSTEM', 'reserved'),
    ('bai', 'SYSTEM', 'reserved'),
    ('banco', 'SYSTEM', 'reserved'),
    ('banza', 'SYSTEM', 'reserved'),
    ('banzai', 'SYSTEM', 'reserved'),
    ('banzami', 'SYSTEM', 'reserved'),
    ('banzamii', 'SYSTEM', 'reserved'),
    ('bde', 'SYSTEM', 'reserved'),
    ('bfa', 'SYSTEM', 'reserved'),
    ('bic', 'SYSTEM', 'reserved'),
    ('bna', 'SYSTEM', 'reserved'),
    ('business', 'SYSTEM', 'reserved'),
    ('compliance', 'SYSTEM', 'reserved'),
    ('emis', 'SYSTEM', 'reserved'),
    ('finance', 'SYSTEM', 'reserved'),
    ('help', 'SYSTEM', 'reserved'),
    ('legal', 'SYSTEM', 'reserved'),
    ('merchant', 'SYSTEM', 'reserved'),
    ('millennium', 'SYSTEM', 'reserved'),
    ('multicaixa', 'SYSTEM', 'reserved'),
    ('ops', 'SYSTEM', 'reserved'),
    ('pay', 'SYSTEM', 'reserved'),
    ('payment', 'SYSTEM', 'reserved'),
    ('payments', 'SYSTEM', 'reserved'),
    ('root', 'SYSTEM', 'reserved'),
    ('sandbox', 'SYSTEM', 'reserved'),
    ('security', 'SYSTEM', 'reserved'),
    ('service', 'SYSTEM', 'reserved'),
    ('standard', 'SYSTEM', 'reserved'),
    ('superuser', 'SYSTEM', 'reserved'),
    ('support', 'SYSTEM', 'reserved'),
    ('system', 'SYSTEM', 'reserved'),
    ('test', 'SYSTEM', 'reserved'),
    ('transactions', 'SYSTEM', 'reserved'),
    ('wallet', 'SYSTEM', 'reserved'),
    ('wallets', 'SYSTEM', 'reserved')
ON CONFLICT (handle) DO NOTHING;
