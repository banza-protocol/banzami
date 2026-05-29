# BanzamIA — Overview

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## What is BanzamIA?

BanzamIA is the AI-native interface for building, validating, and certifying Banzami protocol operators. It is deployed at `banzami.org/banzamia`.

BanzamIA is not a chatbot. It is an **AI-native Protocol Agent** — an AI system specifically grounded in the Banzami protocol, financial invariants, conformance specifications, and governance documents.

> **Tools determine truth. AI explains truth.**

This is BanzamIA's core principle. Financial invariants are verified by deterministic tools. BanzamIA surfaces tool results in natural language, explains protocol semantics, generates integration code, and guides operators through certification — but it does not replace the tools that enforce correctness.

---

## What BanzamIA Is

- A protocol Q&A interface grounded in citations (RFC, ADR, invariants)
- A guided operator manifest creation tool
- A conformance test runner and result explainer
- A trace reconstructor and invariant verifier
- An SDK code generator for Banzami integration
- A semantic search engine over protocol documentation

## What BanzamIA Is Not

- A substitute for running the conformance suite
- An autonomous certifier (certification requires tooling + human approval)
- A general-purpose chatbot (it refuses out-of-scope queries)
- A financial operations interface (it cannot initiate payments or move money)

---

## The Eight Modules

| Module | Purpose |
|--------|---------|
| **Chat** | Protocol Q&A with source citations |
| **Operator Builder** | Guided creation of Operator Manifests |
| **Conformance** | Conformance test execution and result analysis |
| **Manifest Validator** | Structural and semantic manifest validation |
| **Trace Explainer** | Causal timeline reconstruction and invariant verification |
| **SDK Assistant** | Code generation and SDK integration guidance |
| **RFC/ADR Explorer** | Governance document search and explanation |
| **Knowledge Search** | Semantic search over all protocol documentation |

---

## Operational Modes

### Live Mode

When `NEXT_PUBLIC_BANZAMIA_API_URL` is configured, BanzamIA connects to the live API:

- Real streaming responses from protocol-grounded models
- Multi-model routing (orchestrator → task-specific model)
- Qdrant vector store for semantic knowledge retrieval
- Citation sourcing from indexed protocol documents
- Tool integration for invariant checking and manifest validation

Live mode is indicated by a green badge: **⬤ Live — connected to BanzamIA API**

### Demo Mode

When the API is unavailable, BanzamIA falls back to static demo responses:

- Pre-written responses for common protocol questions
- Source chips showing where citations would appear
- No real model inference — deterministic fallback
- Visual amber badge: **◯ Demo — set NEXT_PUBLIC_BANZAMIA_API_URL for live mode**

---

## Security Posture

BanzamIA operates with a strict read-only security posture:

| Action | Allowed |
|--------|---------|
| Answer protocol questions | ✓ |
| Generate SDK code examples | ✓ |
| Validate manifest structure | ✓ |
| Reconstruct payment traces | ✓ |
| Initiate financial operations | ✗ |
| Approve certifications autonomously | ✗ |
| Modify the implementation matrix without governance phrases | ✗ |
| Access production financial data | ✗ |

---

## Homepage Integration

A lightweight BanzamIA entry card is embedded on the Banzami homepage. It provides:

- 6 quick-prompt chips for common protocol questions
- Inline streaming answer (read-only, no tools)
- Source chips showing citation types
- "Continuar no BanzamIA completo →" deep link to `/banzamia?question=...&auto=1`

Deep links to the full BanzamIA interface auto-submit the question and show the complete module panel.

---

## References

- [Architecture](architecture.md) — technical architecture of BanzamIA
- [API](api.md) — BanzamIA API contract
- [Operator Builder](operator-builder.md) — manifest creation guide
- [Manifest Validator](manifest-validator.md) — validation reference
- [Trace Explainer](trace-explainer.md) — trace reconstruction guide
- [SDK Assistant](sdk-assistant.md) — code generation guide
- [Knowledge Search](knowledge-search.md) — semantic search guide
- [Roadmap](roadmap.md) — BanzamIA development roadmap
