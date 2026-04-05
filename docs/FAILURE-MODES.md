# Cristalina v4
## Failure Modes

**Status:** Draft

---

## 1. Purpose

This document exists so the project can think against itself early.

The architecture is ambitious enough that it needs explicit failure awareness.

---

## 2. Primary Failure Modes

### 2.1 Wiki Becomes Shadow Canon

The wiki starts as derived synthesis but gradually becomes the place where the "real" truth lives informally.

Why dangerous:

- governance is bypassed without anyone saying so

### 2.2 Runtime Projection Becomes Truth Source

Adapters become so operationally central that projections start defining memory semantics.

Why dangerous:

- adapter-specific drift becomes architecture drift

### 2.3 World Model and Canon Collapse Together

The system stops distinguishing between operationally useful world claims and governed durable truth.

Why dangerous:

- no meaningful promotion discipline remains

### 2.4 Proposal Inflation

Too many weak or noisy proposal candidates are generated.

Why dangerous:

- governance becomes clogged
- signal degrades

### 2.5 Contradiction Accumulation Without Resolution

Contradictions are detected but not operationally handled.

Why dangerous:

- the system becomes self-aware of inconsistency without being able to recover

### 2.6 Provenance Erosion

Objects remain in the system but their path back to evidence becomes weak or ambiguous.

Why dangerous:

- trust in the memory system declines

### 2.7 Adapter Semantic Fork

OpenClaw and Hermes begin to require different memory semantics instead of merely different projections.

Why dangerous:

- runtime portability fails

### 2.8 Over-Constitutionalization

The core becomes so rigid that the system stops being practically useful in runtime.

Why dangerous:

- the architecture is "correct" but inert

### 2.9 Over-Editorialization

The wiki becomes beautiful, rich, and impressive, but the underlying world and canonical layers remain weak.

Why dangerous:

- the project looks smarter than it is

---

## 3. Monitoring Rule

A mature version of the project should eventually map these failure modes to:

- tests
- lint rules
- metrics
- diagnostics

Until then, this document serves as a conceptual risk register.
