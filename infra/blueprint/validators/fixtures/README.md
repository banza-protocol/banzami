# Secret-scanner detection fixtures (SYNTHETIC)

These files contain **unmistakably fake, non-operational** credential-shaped strings
used ONLY to prove the tracked-secret scanner catches each category. This directory
(`infra/blueprint/validators/fixtures/`) is the **only** path exempted from the
whole-tree secret scan — every other tracked Blueprint file is scanned by default.

Nothing here is a real or usable secret. Do not add real values. Do not exempt any
other path.
