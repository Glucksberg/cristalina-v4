# Cristalina v4
## Adapter Contracts

**Status:** Draft

---

## 1. Purpose

This document defines the minimum shared contract expected of all runtime adapters.

It exists so that OpenClaw and Hermes integrations do not drift into separate memory semantics.

---

## 2. Every Adapter Must Receive

From the core:

- projection-ready canonical fragments
- projection-ready world-model fragments
- projection-ready wiki fragments
- runtime diagnostics
- layer labels for projected fragments
- authority labels for projected fragments
- stable upstream references
- projection manifest metadata

---

## 3. Every Adapter May Write Back

To the core, through legal paths:

- observations
- machine-safe structured edits
- runtime-local diagnostics
- evidence-only edits
- runtime session and thread metadata when relevant

Adapters may not write canonical truth directly.

### Intake profile rule

Adapters should write back through registered intake profiles rather than ad hoc workflow branches.

That means the adapter supplies:

- source payload
- provenance
- runtime identity context
- profile-specific semantic overrides when needed

But the core still owns:

- observation formation
- world structure emission
- disposition routing
- proposal semantics
- contradiction surfacing

---

## 4. What May Differ Between Adapters

- projection shape
- context-budget strategy
- file or surface format
- runtime-specific diagnostics UX
- runtime-specific editing affordances

---

## 5. What Must Not Differ Between Adapters

- object meaning
- provenance model
- governance semantics
- legality of transitions
- authority boundaries between world, canon, wiki, and projections
- distinction between actor identity, runtime instance, session, and thread

---

## 6. First-Class Adapters

The first two adapters in scope are:

- OpenClaw
- Hermes Agent

Their differences should test portability.

They must not force architectural divergence.
