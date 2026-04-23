# Cristalina v4
## Consistency Hardening Plan

**Status:** Active Draft  
**Purpose:** Close the remaining consistency gaps that are not fully captured by the current session phrases, without weakening the repository's contracts-first sequencing.

---

## 1. Why this plan exists

The current session phrases already cover a large part of Cristalina's law:

- provenance and identity
- governance legality
- recovery and replay of write paths
- projection discipline
- retrieval legality
- separation between runtime, world, wiki, and canon

What is still under-specified is the law that keeps those pieces coherent under
retries, time, retirement, continuity, version drift, and cross-subsystem
observation.

This plan hardens those remaining areas as first-class contracts instead of
letting them survive only as code behavior, review notes, or local test
assumptions.

---

## 2. The six missing hardening tracks

### 2.1 Idempotency and retry convergence

Gap:

- replay and recovery are already strong, but the repo does not yet state one
  explicit end-to-end law for duplicate delivery, queue retry, receipt replay,
  projection recompilation, and maintenance reruns

Target law:

- the same logical operation may be retried, replayed, or redelivered, but it
  must converge on the same durable semantic result instead of producing
  duplicate truth, duplicate lifecycle transitions, or fake history

### 2.2 Temporal law

Gap:

- many flows preserve chronology implicitly, but the repo does not yet enforce
  one shared distinction between observation time, persistence time, governance
  time, projection time, and resume time

Target law:

- temporal correctness must come from recorded time axes in durable objects and
  audit records, not from fresh wall-clock assumptions made during replay or
  recompilation

### 2.3 Retirement, supersession, and expiry lifecycle

Gap:

- creation, promotion, contradiction, and replay are well covered, but the
  repo still needs one explicit law for how old truth stops being active while
  remaining inspectable

Target law:

- superseded, expired, or retired objects must stop presenting as current
  truth across canon, wiki, retrieval, indexes, and projections without losing
  historical inspectability

### 2.4 Session continuity and handoff legality

Gap:

- `docs/OPERATIONAL-SESSION-MEMORY-RFC-V2.md` is strong, but session continuity
  still deserves to be treated as a hardening workstream rather than only an
  RFC-backed direction

Target law:

- checkpoints remain the authoritative continuity primitive
- session packs remain derived
- receipts prove continuity events without becoming shadow write paths
- resume flows must not invent identity, authority, or truth from summaries

### 2.5 Versioning and migration law for derived artifacts

Gap:

- the codebase already uses policy versions, checksums, generations, and
  manifests, but it does not yet state one repository-wide law for when a
  derived artifact is fresh, stale, incompatible, reproducible, or migratable

Target law:

- derived consumers must be able to detect when a result came from an old
  compiler, policy, index, or generation, and recovery must be able to replay
  old outputs without silently trusting stale semantics

### 2.6 Cross-subsystem snapshot semantics

Gap:

- the repository now records the current lock split as a scope note, but it
  does not yet define when mixed-state reads are acceptable and when they must
  fail, wait, or surface diagnostics

Target law:

- cross-subsystem consistency must be an explicit contract: either a read is
  allowed to tolerate mixed state under a named trust model, or it must demand
  a reproducible snapshot boundary

---

## 3. Hardening method

Each track should be implemented in the same order:

1. document the invariant and the prohibited shortcuts
2. converge the invariant into types and schema fields
3. prove the invariant with narrow executable flows and fixtures
4. move the law into reusable kernel entrypoints
5. only then expand adapters, maintenance jobs, or retrieval surfaces

This keeps the work aligned with the repository rule:

`docs -> types -> schemas -> fixtures -> kernel code -> adapters`

---

## 4. Workstreams

### W1. Idempotency and retry convergence

#### W1-A. Contract

Define the logical operation boundary for:

- adapter write-through ingress
- owner queue actions
- recovery replay
- session-resume receipts
- wiki maintenance runs
- vector export / retrieval maintenance

Every boundary must answer:

- what identifies the logical operation
- what counts as a retry of the same operation
- what durable outputs are allowed to be reproduced
- what must never be duplicated

#### W1-B. Durable contract additions

Add or standardize fields where needed:

- operation identity or replay key
- causal parent refs when a write is a replay or retry
- deterministic receipt identity where the same continuity event is retried
- maintenance run identity where reruns should converge instead of fork

#### W1-C. Executable proof

Add focused flows proving:

- duplicate adapter delivery does not duplicate durable truth
- owner action replay does not produce a second terminal transition
- replayed receipt reuses or rejects instead of fabricating a second event
- projection recompilation can supersede derived artifacts without semantic
  duplication
- wiki maintenance reruns are idempotent at the record and audit level

#### W1-D. Acceptance

This track is done when retried input can at most reproduce existing outputs or
emit explicit diagnostics, never produce an additional semantic transition.

### W2. Temporal law

#### W2-A. Contract

Define the required time axes and where they are authoritative:

- observation time
- ingestion/persistence time
- governance decision time
- projection compilation time
- continuity receipt time
- effective/superseded time where lifecycle depends on temporal validity

#### W2-B. Durable contract additions

Converge naming and meaning across objects:

- avoid reusing one timestamp for multiple semantics
- prefer explicit field names over interpretation by object kind
- require replay to preserve recorded chronology instead of generating new
  substitute time claims

#### W2-C. Executable proof

Add flows proving:

- replay preserves original observation chronology
- deferred ratification uses current approval time while preserving original
  intake time
- projection recompilation changes compile time without mutating upstream event
  time
- resume receipts record consumption/application time without rewriting the
  checkpoint chronology

#### W2-D. Acceptance

This track is done when every major durable object can be placed on the correct
time axis without inference from runtime context.

### W3. Retirement, supersession, and expiry lifecycle

#### W3-A. Contract

Document one shared lifecycle law for:

- canonical supersession
- world-claim inactivity
- wiki stale or unsupported claims
- expired queues and deferred actions
- derived artifact supersession

The contract must distinguish:

- no longer active
- historically preserved
- legally blocked from support or promotion
- stale and needing recompilation

#### W3-B. Durable contract additions

Standardize fields and references where needed:

- `supersedes_ref` / `superseded_by_ref`
- explicit inactive/expired disposition where applicable
- derived artifact linkage to the active authoritative source
- projection/index markers for stale vs blocked vs retired

#### W3-C. Executable proof

Add flows proving:

- superseded canon no longer surfaces as current truth
- stale wiki-derived claims remain inspectable but cannot silently support
  truth
- expired review queues cannot be reopened by replay accident
- retrieval and projections prefer active/current state while preserving trace

#### W3-D. Acceptance

This track is done when lifecycle closure propagates across reads, retrieval,
and projections without deleting history or letting stale truth masquerade as
current.

### W4. Session continuity and handoff legality

#### W4-A. Contract

Promote the RFC guidance into executable hardening law:

- checkpoints are the continuity authority
- packs are derived packaging
- summaries are non-authoritative operator aids
- receipts prove continuity events
- proposal extraction from continuity prose is prohibited

#### W4-B. Durable contract additions

Complete the continuity contract with:

- stable checkpoint generation semantics
- explicit resume receipt identity and actor rules
- clear compatibility rules for `read_policy_version`,
  `policy_snapshot_ref`, compiler profile, and source checkpoint
- stable system actor or required principal where a nominal placeholder is no
  longer acceptable

#### W4-C. Executable proof

Add flows proving:

- duplicate resume receipt attempts converge safely
- packs become invalid when upstream refs or epochs break compatibility
- summaries cannot be used as legal proposal input
- resumed state remains traceable to authoritative upstream refs

#### W4-D. Acceptance

This track is done when session continuity is operationally useful without
becoming a second runtime memory authority.

### W5. Versioning and migration law for derived artifacts

#### W5-A. Contract

Define which version signals are mandatory for trust:

- policy version
- compiler/profile version
- index or embedding generation identity
- source checkpoint or authoritative input generation
- migration lineage when a stored artifact was transformed

#### W5-B. Durable contract additions

Ensure manifests and artifacts can answer:

- what generated this output
- under which version or policy
- whether it is reproducible from the current authoritative source
- whether it is stale, incompatible, or merely old

#### W5-C. Executable proof

Add flows proving:

- policy change invalidates or warns on old derived output explicitly
- index generation mismatch does not silently support stale retrieval
- migration preserves replayability and provenance
- consumers can choose between recompile, reject, or accept-with-warning

#### W5-D. Acceptance

This track is done when stale derived outputs are detectable by contract rather
than by operator intuition.

### W6. Cross-subsystem snapshot semantics

#### W6-A. Contract

Classify read paths into two groups:

- mixed-state-tolerant reads under the current trust model
- snapshot-required reads that must observe one coherent boundary

For each snapshot-required read, define the boundary source:

- shared generation marker
- manifest-level snapshot token
- explicit wait/retry discipline
- hard failure with diagnostic

#### W6-B. Durable contract additions

Add only the smallest contract needed:

- do not jump straight to global transaction machinery
- prefer reproducible snapshot markers, generation refs, or diagnostic-aware
  reads first

#### W6-C. Executable proof

Add flows proving:

- tolerant reads remain legal and diagnosable when mixed state is expected
- snapshot-required readers reject or wait instead of silently composing mixed
  truth
- maintenance or projection consumers can prove which boundary they read

#### W6-D. Acceptance

This track is done when cross-subsystem consistency is explicit law instead of
an accidental property of timing.

---

## 5. Recommended sequencing

### Phase A. Contract convergence

Start with:

1. W2 Temporal law
2. W3 Retirement and supersession lifecycle
3. W4 Session continuity and handoff legality

Reason:

- these three define the semantics that W1, W5, and W6 need to preserve

### Phase B. Retry and version hardening

Then implement:

1. W1 Idempotency and retry convergence
2. W5 Versioning and migration law

Reason:

- once time, lifecycle, and continuity rules are explicit, duplicate delivery
  and stale generation handling can be made deterministic instead of heuristic

### Phase C. Cross-subsystem read boundaries

Finish with:

1. W6 Cross-subsystem snapshot semantics

Reason:

- this is the most architectural of the six tracks and should be informed by
  the final shape of continuity, lifecycle, and version markers

---

## 6. Definition of "hard enough to trust"

These tracks are hard enough for the current product posture when:

- duplicate delivery and replay cannot create second-order semantic writes
- every major durable object has an explicit temporal role
- retired or superseded truth stops presenting as current across reads and
  retrieval
- continuity artifacts stay derived from checkpoints and cannot become shadow
  authority
- stale derived outputs are detectable by contract
- mixed-state tolerance versus snapshot requirement is explicit per read path
- every rule above is proven by narrow executable tests at the same boundary
  where production code enforces it

This is not "final hardening".

It is the level of hardening where trusted collaborators can rely on the
system's behavior in these areas without reverse-engineering intent from the
codebase.

---

## 7. Immediate next deliverables

1. add a short contract document or focused section for each of the six tracks
2. map each track to existing types and missing schema fields
3. add one executable fixture family per track
4. move the proven rules into shared kernel entrypoints
5. expose only the already-hardened behavior to adapters and maintenance jobs

---

## 8. Existing documents this plan should converge with

- `docs/HARDENING-PLAN.md`
- `docs/OPERATIONAL-SESSION-MEMORY-RFC-V2.md`
- `docs/FAILURE-MODES.md`
- `docs/LEGAL-TRANSITIONS.md`
- `docs/PROJECTION-READ-DISCIPLINE.md`
- `docs/RETRIEVAL-AND-VECTOR-ENGINE.md`
- `docs/SCOPE-NOTES.md`
