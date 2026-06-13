# Conformance — owned by the BANZA protocol

**Version:** 1.0
**Status:** Pointer (operator scope)

---

> **The conformance suite is not a Banzami document.** The machine-executable specification that defines "protocol compliant" — suite structure, per-level test sets, and the binary pass/fail rule — is defined and owned by the **BANZA protocol**, not by any operator.
>
> Canonical source: **`BANZA_CONFORMANCE.md`** and `conformance/` in the BANZA protocol repository ([github.com/banza-protocol/banza](https://github.com/banza-protocol/banza)).

## Banzami's relationship to conformance

Banzami **runs** the BANZA conformance suite against its implementation to demonstrate it operates the protocol correctly. Banzami:

- **does not** define the conformance suite or its tests,
- **does not** decide what "conformant" means,
- **does** strive to pass every test for its declared certification level.

Banzami consumes the conformance definition from BANZA; it never redefines it locally.

*(This file was a full copy of the protocol conformance spec; it was reduced to a pointer in BANZAMI-PURIFICATION-EXECUTION-001 to keep the operator repo free of protocol-owned content.)*
