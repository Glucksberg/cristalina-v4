# Cristalina v4
## Next Kernel Extensions

**Status:** Draft  
**Purpose:** define two small-but-important kernel extensions that appear well-supported by the current research line and consistent with the repository's existing contracts: projection read discipline and procedural memory.

---

## 1. Why This Document Exists

The repository already has strong early contracts for:

- runtime identity
- temporal world structure
- contradiction handling
- governed canonical promotion
- projection provenance and layer labeling

What now stands out is not a missing surface feature.

It is a missing next-step hardening of two kernel concerns:

1. the read path still needs stronger context discipline
2. the memory model still lacks an explicit procedural dimension

These should be treated as targeted continuations of the current core, not as a new architecture branch.

---

## 2. Scope Rule

This document does **not** propose:

- adapter-first features
- broad multi-agent permissions
- a large access-control subsystem
- a new parallel ontology for all memory

It proposes only:

- tighter rules for what may enter a runtime projection in a given context
- a minimal path for procedural memory to become first-class without collapsing facts, world state, and canon

---

## 3. Extension A: Projection Read Discipline

### 3.1 Why it matters

The repository already knows that projections must not become hidden truth sources.

But projection discipline is not only about labeling source layer and authority.
It is also about **selection**.

In practical terms:

- not every stored record should be equally eligible for active projection
- eligibility should depend on runtime context, thread context, temporal status, epistemic status, and visibility law
- projection should remain reproducible and auditable even when records are suppressed

This is especially important even in single-user personal use.

The risk is not unauthorized outsiders.
The risk is cross-context leakage:

- temporary runtime-local state looking like durable identity
- disputed or historical claims entering projection as if current
- sensitive or irrelevant memory entering active context without need
- one runtime's operational state drifting into another runtime's persistent self-model

### 3.2 Existing substrate to build on

This extension should reuse what already exists:

- `visibility_state.privacy_scope`
- `ProjectionManifest.audience`
- runtime identity refs
- temporal status
- epistemic status
- layer and authoritative home labels
- stable upstream refs

That means this is not a fresh subsystem.
It is a hardening of the current projection path.

### 3.3 Proposed minimum contract

The next kernel pass should define a **projection read context** that answers at least:

1. which adapter is being compiled for
2. which runtime instance is active
3. which session is active
4. which thread is active
5. which audience is targeted
6. whether the compilation is:
   - active runtime context
   - background maintenance
   - diagnostic inspection

The compiler should then apply a named read policy before projection assembly.

### 3.4 Minimal read rules

The MVP expansion should enforce at least these rules:

- `runtime_private` records should not leave their owning runtime/session/thread context by default
- `owner_private` records may be projectable, but not all must become active context automatically
- `disputed` or `historical` world claims should never be rendered as if they were current ratified truth
- records from `wiki` remain editorial even when projected prominently
- projection suppression should preserve inspectability through manifest metadata or diagnostics

### 3.5 Proposed minimal artifact change

The smallest useful expansion is likely:

- extend `ProjectionManifest` with:
  - `read_policy_version`
  - `suppressed_refs`
  - `context_refs`
  - optional `policy_snapshot_ref`

This is intentionally lighter than inventing a large durable ACL object family immediately.

If later needed, the project may add a first-class `ProjectionReadDecision`.
That should come only after the manifest-level contract proves insufficient.

### 3.6 Design rule

Projection read discipline must answer:

- why this record entered the projection
- why this record was suppressed
- under which context and policy version that happened

If that answer cannot be reconstructed, the read path is still too implicit.

---

## 4. Extension B: Procedural Memory

### 4.1 Why it matters

The current core already models:

- observations
- episodes
- entities
- relations
- world claims
- canonical memory

What it does not yet model well is:

- reusable ways of acting
- repeated successful workflows
- bounded operating routines learned from experience

This matters because the frontier is shifting from:

- "what facts should the agent remember"

toward:

- "what patterns of action should the agent reuse"

### 4.2 Minimal path preferred

The repository should **not** begin by creating a large parallel procedural subsystem.

The smallest consistent first move is:

- add `procedure` to `MemoryObjectKind`

Then allow:

- `WorldClaim(kind=procedure)`
- `CanonicalMemoryObject(kind=procedure)`

This keeps procedural memory inside the existing law:

- it can begin as structured world understanding
- it can remain provisional
- it can become governed only through proposal and ratification

### 4.3 What a procedural claim should mean

A procedural claim is not a raw execution log.

It is a reusable statement such as:

- when condition X holds, prefer workflow Y
- for source type Z, gather fields A/B/C before proposing canon
- when contradiction type Q appears, prefer strategy R unless policy blocks it

So the first procedural layer should be:

- claim-like
- typed
- provenance-backed
- testable against episodes

### 4.4 What should come before broader procedural abstractions

Before introducing new procedural object families, the project should prove that it can represent:

- a procedure candidate linked to supporting episodes
- activation conditions
- success or failure evidence
- bounded scope
- supersession or revision over time

Only after that should the project consider richer families such as:

- `ProcedureTrace`
- `WorkflowPattern`
- executable skill packaging

### 4.5 Why this fits Cristalina v4

This path preserves the repository's existing discipline:

- docs first
- no adapter-defined semantics
- no hidden convenience truth
- no detached memory type explosion

It also keeps procedural memory from bypassing the current governance law.

---

## 5. Sequencing Recommendation

These extensions should not be implemented at the same depth at the same time.

Recommended order:

1. projection read discipline at manifest and compiler level
2. eval coverage for suppression, abstention, and stale-claim handling
3. `procedure` as a first-class memory kind
4. one small executable flow proving `procedure` through world -> governance -> canon

Why this order:

- the read path is already close enough to harden now
- procedural memory should enter only after the projection path is less implicit

---

## 6. Eval Implications

If these extensions are accepted, the eval plan should grow to include at least:

- projection excludes runtime-private records outside their owning context
- projection preserves historical/disputed labeling under read policy
- suppressed records remain inspectable through manifest metadata
- procedural claims can be revised or superseded without losing provenance
- procedural memory does not bypass governance to become canon
- abstention is preferred over presenting disputed memory as stable fact

---

## 7. Non-Goals

These extensions should not be mistaken for:

- enterprise permission modeling
- role-based access control across many users
- a general workflow engine for all agent actions
- a replacement for runtime memory blocks

They are narrower than that.

They are about:

- making the read path lawful
- giving action-pattern memory a legal home

---

## 8. Compact Thesis

The next credible kernel move after the current hardening wave is:

- make projection selection as explicit as projection provenance
- let procedures enter memory law the same way facts and preferences already do

That would extend the current architecture without widening it irresponsibly.
