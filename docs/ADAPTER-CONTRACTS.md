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
- stable upstream references
- projection manifest metadata

---

## 3. Every Adapter May Write Back

To the core, through legal paths:

- observations
- machine-safe structured edits
- runtime-local diagnostics
- evidence-only edits

Adapters may not write canonical truth directly.

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

---

## 6. First-Class Adapters

The first two adapters in scope are:

- OpenClaw
- Hermes Agent

Their differences should test portability.

They must not force architectural divergence.
