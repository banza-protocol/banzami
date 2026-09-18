# Machine-readable specifications

**These are schemas, not populated registries.** Phase A populates nothing —
every example below is drawn from a verified discovery, and no speculative or
placeholder capability, actor or journey appears.

| File | Proposed canonical home | Status |
|---|---|---|
| `capability-extension.schema.yaml` | extends `quality/operator-assurance-manifest.yaml` | proposed |
| `actors.schema.yaml` | `quality/validation/actors.yaml` | proposed |
| `journeys.schema.yaml` | `quality/validation/journeys.yaml` | proposed |
| `suites.schema.yaml` | `quality/validation/suites.yaml` | proposed |
| `evidence-manifest.schema.json` | written per journey into the evidence store | proposed |

See [03 — Capability Registry specification](../03-capability-registry-spec.md)
for why these extend `quality/` rather than creating a top-level `validation/`
directory.
