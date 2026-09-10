# Business onboarding — evidence at runtime 0196d3d1946c (final)

`0196d3d1946c` is `6d62acc0492a` plus the gRPC-Go 1.83.2 patch (GHSA-2v4p-qf9q-27wj)
in admin-api, api-gateway and public-api. Every Sandbox service runs `0196d3d1946c`;
the website's source is unchanged since `6d62acc0492a`, whose deployed tree was
verified identical to git. CI run 34491896860: success (10/10).

Re-proved at this runtime: Business App session 22/22, Developer Project onboarding
21/21, Console Configuração financeira (browser) 15/15, tenant isolation 21/0 with
`BUSINESS_CROSS_TENANT_DISCLOSURE=0`, Doa-Sandbox readiness 12/0 (only blocker
`FEE_DESTINATION_TYPE_NOT_ALLOWED`), financial assurance counters all 0 (482 postings).
The full set at `6d62acc0492a` (incl. the candidature 24/27 and F0-DP-011) is in
`../final-6d62acc0492a/`.
