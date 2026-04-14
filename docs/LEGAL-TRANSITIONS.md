# Cristalina v4
## Legal Transitions

**Status:** Draft  
**Purpose:** Freeze the legal movement of information between layers and object states

---

## 1. Why This Document Exists

The main risk now is not missing ideas.

The main risk is illegal transitions that silently collapse the architecture.

This document defines what transitions are legal, what transitions are prohibited, and what gates exist between layers.

---

## 2. Transition Thesis

Information may move forward through the system.

It must not teleport.

The architecture should explicitly reject shortcuts like:

- runtime -> canon
- wiki -> canon without governance
- source -> canon without intermediate interpretation
- projection -> truth

---

## 3. Legal Layer Transitions

### 3.1 Legal forward transitions

The MVP should allow these layer movements:

- `raw -> wiki`
- `raw -> runtime`
- `raw -> world`
- `runtime -> world`
- `runtime -> governance`
- `world -> governance`
- `wiki -> governance`
- `governance -> canon`
- `canon -> derived`
- `world -> derived`
- `wiki -> derived`
- `runtime -> derived`

### 3.2 Conditionally legal transitions

These are legal only with explicit rules:

- `runtime -> wiki`
  only as editorial output, never as truth promotion

- `world -> canon`
  only through governance

- `wiki -> world`
  only when transformed into structured update candidates

- `canon -> world`
  only as synchronization or derived reinforcement, not as an override of temporal structure by default

### 3.3 Illegal transitions

These should be illegal in the MVP:

- `runtime -> canon`
- `raw -> canon`
- `derived -> canon`
- `wiki -> canon` without governance
- `derived -> world` as authoritative update

---

## 4. Legal State Transitions

### 4.1 Governance states

The minimum legal state path should be:

`draft -> proposed -> ratified -> superseded -> archived`

Other legal side branches:

- `draft -> rejected`
- `proposed -> rejected`
- `proposed -> archived`

### 4.2 Epistemic states

The minimum legal epistemic evolution should allow:

- `hypothesized -> inferred`
- `inferred -> confirmed`
- `confirmed -> disputed`
- `inferred -> disputed`

The system should not automatically treat:

- `observed == confirmed`

Observation quality and confirmation quality are different.

### 4.3 Temporal status

The system should allow:

- `active -> bounded`
- `active -> historical`
- `unresolved -> bounded`
- `unresolved -> historical`

---

## 5. Proposal Operations

The current executable baseline supports these proposal operations:

- `create`
- `revise`
- `supersede`

The next expansion after the baseline kernel should add:

- `confirm`
- `deprecate`
- `link`
- `contradict`

Not every operation targets canon.

Some later operations may target:

- world-model updates
- wiki maintenance follow-ups
- contradiction records
- contradiction resolution records

---

## 6. Transition Gates

No durable memory transition should skip gates.

At minimum, the system should enforce:

### 6.1 Structural gate

Is the candidate:

- referenceable
- well-formed
- typed correctly

### 6.2 Evidence gate

Does it have:

- enough support
- enough provenance
- enough traceability

### 6.3 Conflict gate

Does it:

- contradict existing world state
- contradict canonical memory
- target the same `semantic_slot` rather than merely the same broad kind
- require explicit contradiction handling

### 6.4 Policy gate

Does it trigger:

- authority rules
- privacy rules
- audience rules
- risk rules

### 6.5 Ratification gate

Can it be:

- auto-approved
- queued
- rejected
- escalated

---

## 7. Wiki-Specific Legal Transitions

The wiki layer is useful enough that it needs its own explicit legal transitions.

Allowed:

- `raw -> wiki_page`
- `raw -> wiki_claim`
- `world -> wiki_page`
- `canon -> wiki_page`
- `wiki_claim -> proposal`

Not allowed:

- `wiki_claim -> canon` directly
- `wiki_page -> canonical truth` by mere existence

This is the crucial rule that prevents the wiki from becoming a shadow canon.

---

## 8. MVP Flow Rule

For the first executable flow, every durable memory update should be explainable as:

1. where it came from
2. what intermediate object it became
3. which gate it crossed
4. what layer it ended in

If that chain cannot be shown, the transition should be treated as invalid.
