# Cristalina v4
## Kernel Road Buildout Plan

**Status:** Draft  
**Created:** 2026-04-21  
**Purpose:** Turn the current "forest roads" assessment into an executable buildout plan that preserves the repository guardrails: docs -> types -> schemas -> fixtures -> kernel code -> adapters.

---

## 1. Current Verified Baseline

The current repository is not architecture-only. It has a tested kernel trunk.

Verified on 2026-04-21:

- `pnpm test` passed: 109 tests
- `pnpm typecheck` passed
- `pnpm build` passed

The suite proves these roads are already usable:

- source intake for the current preference-oriented profiles
- authenticated write-through into the core
- runtime identity preservation through flow and projection
- owner authority separated from `speaker_ref`
- owner-ratification queues with approval, rejection, expiration, and recovery
- manual contradiction review queues with explicit owner/system authority
- canonical create, revise, and supersede legality
- active contradiction blocking for revise and supersede
- projection read filtering for runtime/private context mismatches
- projection traces for historical or disputed claims
- suppression metadata in projection manifests
- path containment for raw payloads, wiki paths, projection artifacts, and recovery journals
- append-style audit durability under concurrency
- schema/runtime convergence for the currently modeled object families
- thin OpenClaw and Hermes adapter wrappers over the same core semantics

The current trunk is therefore:

`raw source -> intake -> runtime/world/wiki artifacts -> disposition -> proposal -> governance/review -> canon/world resolution -> projection -> adapter read/write boundary`

That trunk is strong, but it is still narrow.

---

## 2. Main Diagnosis

The repository has one well-paved road through the forest, not yet a full road network.

Most executable pressure still runs through conversation/preference flows. Many other regions already exist as contracts, schemas, storage directories, or docs, but they do not yet have equivalent executable write paths, maintenance flows, or adapter round trips.

The next work should avoid widening adapters first. The correct sequence is to turn the current trunk into reusable kernel roads, then open adjacent roads inside the core, then let adapters consume those roads without defining new semantics.

---

## 3. Road Classes

### 3.1 Paved Roads

These are already contract-backed and tested:

- preference-oriented intake profiles
- canonical proposal gates for `create`, `revise`, and `supersede`
- owner-ratification review queue
- manual contradiction review queue
- contradiction resolution strategies and projection traces
- identity-aware projection selection for runtime projections
- store initialization, validation, recovery, snapshots, and audit append logs
- OpenClaw and Hermes thin authenticated write-through and projection-read surfaces

### 3.2 Gravel Roads

These have meaningful substrate, but limited breadth:

- structured preference intake is declarative, but still preference-shaped
- procedure memory can move from world -> governance -> canon, but lacks a dedicated discovery or maintenance flow
- projection read discipline has runtime-context rules, but not full background-maintenance or diagnostic-inspection modes
- integrity evals exist, but they are closer to smoke/invariant checks than a broad comparative harness
- schemas converge for present object families, but not every planned storage region has an executable lifecycle

### 3.3 Surveyed But Unbuilt Roads

These exist in docs and layout, but still need executable routes:

- wiki maintenance: source summaries, page refresh, claim extraction, index/log maintenance, stale-page diagnostics, link linting
- ontology definitions and policy snapshots as live governed records
- runtime working memory as a bounded operational layer
- richer operational/session continuity beyond the executable baseline from `docs/OPERATIONAL-SESSION-MEMORY-RFC-V2.md`; immutable `working_memory_checkpoint` records, derived session packs, and resume receipts are now implemented as the first slice
- raw attachments/imports as first-class intake inputs beyond path containment
- richer proposal operations beyond `create`, `revise`, and `supersede`
- adapter drift handling and runtime diagnostics feedback
- broader OpenClaw and Hermes runtime UX beyond the current thin wrappers
- longitudinal, consistency, contradiction, projection-fidelity, and retrieval-baseline evals

---

## 4. Buildout Principles

1. Do not build adapter UX to compensate for missing core roads.
2. Do not add new object families unless the current envelope, schema, validation, and store lifecycle can carry them.
3. Every new road needs a minimal fixture before broader implementation.
4. Every new road must preserve the distinction between evidence provenance, normalized subject, authenticated principal, and legal authority.
5. Every projection expansion must explain both inclusion and suppression.
6. Wiki output must remain editorial and derived; it must not become shadow canon.
7. Recovery and audit behavior must be designed with the write path, not retrofitted after success cases.

---

## 5. Phase A: Convert The Existing Trunk Into Reusable Roadbed

### Goal

Make the current preference flow less special without weakening it.

### Work

- Extract a generic workflow runner around the proven store pattern:
  - write lock
  - recovery journal
  - authoritative record materialization
  - derived artifact recompilation
  - validation log append
  - audit append
  - idempotent rerun and repair
- Define a registered intake profile interface that covers:
  - source normalization
  - semantic profile resolution
  - disposition routing
  - proposal emission
  - optional contradiction detection
  - projection recompilation inputs
- Keep `conversation_preference`, `openclaw_projection_feedback`, and `structured_preference_signal` as compatibility profiles implemented through the generic runner.
- Move profile-specific assumptions out of generic store/recovery machinery.

### Initial Runner Contract

Phase A starts with a narrow registered-profile contract rather than a broad new intake product surface.

A `RegisteredIntakeProfile` must declare:

- a stable `profile_id`
- the compatible `intake_kind`
- the `runner_contract_version`
- the source-normalization function used before authoritative writes
- the semantic-profile resolver and stable semantic-profile fingerprint
- the disposition-routing strategy used by the profile
- the proposal/intake emission function
- optional contradiction detection
- the projection inputs needed after the authoritative write

The generic runner owns the reusable write mechanics: store initialization, write lock, recovery journal, authoritative file materialization, validation-log append, audit append, idempotent rerun, and repair. A profile may describe and emit domain-specific records, but it must not define its own durability, replay, or reuse law.

Profile reuse is legal only when the registered profile, authenticated authority, runtime identity, source payload, and semantic-profile fingerprint still match the already materialized flow.

### Tests

- Existing 109 tests must remain green.
- Add tests proving the generic runner rejects profile reuse when authority, identity, source payload, or semantic profile changes.
- Add one fixture showing the current preference flow still materializes the same layer set through the generic runner.

### Acceptance Criteria

- The preference flow is no longer the only shape the store runner understands.
- No adapter imports a profile-specific shortcut as its law source.
- Recovery, replay, and validation behavior stay shared.

---

## 6. Phase B: Open Adjacent Non-Canonical Intake Roads

### Goal

Prove that not every source has to become a canonical proposal.

### Work

- Add an `evidence_only` intake fixture that writes raw source and disposition without world/canon promotion.
- Add a `runtime_only` intake fixture that writes runtime observation/session/thread context without canon proposal.
- Add a `diagnostic_only` intake fixture that writes bounded diagnostics and audit entries.
- Add a source-import fixture that uses `raw/imports` as a real payload source, not only as a path-containment test.
- Add an attachment-reference fixture that proves `raw/attachments` can be referenced safely without being treated as truth.

### Initial Non-Canonical Contract

Phase B starts with three explicit non-canonical modes:

- `evidence_only`
- `runtime_only`
- `diagnostic_only`

These modes may write raw source records, disposition records, runtime observations, diagnostics, validation log entries, and audit entries. They must not emit proposal records, ratification records, canonical records, world claims, wiki pages, or wiki claims.

Attachment refs in this path are references to bounded raw evidence only. They must stay under `raw/attachments/` and must not be treated as claims, proposals, or truth without a later governed intake path dereferencing them.

### Tests

- Disposition outcome must match target layer requirements.
- No non-canonical disposition may emit a ratified canonical record.
- Projection may show diagnostics or runtime trace only through declared read policy.

### Acceptance Criteria

- The disposition model becomes a real routing map, not mostly a preference-flow annotation.
- Raw/import/attachment roads are operationally meaningful while remaining evidence-only by default.

---

## 7. Phase C: Build The Wiki And Memory Browser Road

### Goal

Turn the wiki from projected editorial records into a maintained derived/editorial layer, and expose the whole memory store through a read-only Memory Browser projection.

### Work

- Define `WikiMaintenanceRun` or equivalent minimal workflow contract.
- Define event-driven wiki maintenance as the product model:
  - `source_ingested`
  - `page_refreshed`
  - `query_captured`
  - `lint_run`
  - `claim_superseded`
  - `session_crystallized`
  - `retention_reviewed`
- Keep explicit workflow entrypoints for tests, replay, recovery, and operator-forced repair; manual invocation is an operational fallback, not the expected product model.
- Define a wiki maintainer contract modeled on the LLM Wiki pattern:
  - immutable raw sources
  - LLM-maintained Markdown pages
  - content-oriented `index.md`
  - chronological append-oriented `log.md`
  - disciplined ingest, query-capture, and lint operations
- Implement source summary creation for selected source records.
- Implement page refresh for existing wiki pages from upstream refs, including touched entity/concept/topic/comparison pages.
- Implement wiki claim extraction with explicit `support_refs`.
- Add wiki lifecycle and quality metadata: `confidence_score`, `support_count`, `last_confirmed_at`, `last_seen_at`, `staleness_state`, `supersedes_ref`, `superseded_by_ref`, `retention_priority`, and `quality_score`.
- Maintain `wiki/index.md` as a compact catalog with page links, one-line summaries, page kind, last updated date, and upstream/source counts.
- Maintain `wiki/log.md` as a parseable chronological record of ingests, refreshes, query captures, lint passes, and review actions.
- Allow high-value query answers to be filed back into the wiki as analysis, synthesis, comparison, or research-question pages with explicit upstream refs.
- Emit diagnostics for:
  - orphan pages
  - stale pages
  - unsupported wiki claims
  - broken wiki links
  - important mentioned concepts without pages
  - duplicate or near-duplicate pages
  - wiki claims contradicted by active world state
  - evidence gaps that should become source-seeking questions
- Define when a wiki claim may emit a proposal candidate, without letting wiki become canon.
- Forbid proposal candidates from wiki prose alone; proposal generation must dereference eligible upstream source/world/canon/governance records.
- Treat optional wiki search tools as acceleration only; `index.md` remains the baseline navigation contract and embeddings must not become the authority layer.
- Maintain a derived editorial wiki graph with typed edges such as `mentions`, `summarizes`, `compares`, `supports`, `contradicts`, and `supersedes`; graph edges are navigation/index artifacts, not authority.
- Add a `memory_browser` projection profile that emits read-only browser artifacts for wiki, canon, world, governance, raw, runtime, audits, and derived records.
- Keep the browser projection read-only and downstream of core records, manifests, diagnostics, and wiki maintenance runs.

### Tests

- A source summary fixture must write page, claim, index/log update, and audit entry.
- A source-ingest fixture must update at least one existing entity/concept/topic page, not only create an isolated source page.
- A query-capture fixture must preserve the pages/upstream refs used to answer and file the answer as editorial synthesis, not canon.
- A lint fixture must detect orphan pages, broken links, unsupported claims, duplicate pages, and missing concept pages.
- A stale-page fixture must emit a diagnostic, not silently overwrite canon or world.
- A wiki-claim proposal fixture must prove that wiki-originated proposals still pass through governance.
- A wiki-claim proposal fixture must reject prose-only proposal extraction when no upstream refs support the claim.
- Projection must label wiki content as editorial and non-authoritative.
- Memory Browser projection must expose layer counts, refs, diagnostics, wiki lifecycle state, governance queues, and projection suppression reasons without creating new authority.

### Acceptance Criteria

- Wiki maintenance has a replayable lifecycle.
- Wiki claims can influence governance only as evidence-backed proposal candidates.
- Wiki diagnostics are inspectable from projection/runtime views.
- The wiki compounds knowledge across ingest and query flows without forcing raw-source rereads for every question.
- Index and log files remain useful to both LLM agents and humans while staying downstream of authoritative records.
- A read-only Memory Browser projection lets humans inspect the whole memory state while all semantics remain defined by core records and projections.

---

## 8. Phase D: Harden Policy And Ontology Roads

### Goal

Make planned policy and ontology storage regions executable.

### Work

- Define minimal `PolicySnapshot` lifecycle:
  - creation
  - activation/reference by projection manifest
  - audit trail
  - validation against governance state
- Define minimal `OntologyDefinition` lifecycle:
  - creation
  - reference from world entities/relations/claims
  - supersession or archival
- Connect projection read policy to optional `policy_snapshot_ref`.
- Add validation that policy/ontology refs are full identity refs where needed, not id-only lookups.

### Tests

- Projection manifests referencing a policy snapshot must fail if the snapshot is missing or invalid.
- World records referencing ontology definitions must fail on mismatched kind/layer.
- Policy snapshots must not grant authority; they describe read/transition policy only.

### Acceptance Criteria

- `governance/policy-snapshots` and `world/ontology` are no longer empty mapped directories.
- Projection read law becomes inspectable as a durable policy snapshot when needed.

---

## 9. Phase E: Extend Projection Roads Beyond Runtime Bootstrap

### Goal

Generalize projection read discipline without losing the current runtime-safety guarantees.

### Work

- Extend projection context modes:
  - active runtime context
  - background maintenance
  - diagnostic inspection
- Define read behavior for `agent_operational`, `project_private`, `shareable`, and `public_safe` beyond the current conservative baseline.
- Keep historical/disputed world claims out of active runtime context, but make their trace surfaces explicit per projection mode.
- Add adapter-agnostic projection package tests before adding adapter-specific formats.
- Define shared projection manifest invariants for OpenClaw and Hermes.

### Tests

- Background maintenance must not leak runtime-private context unless explicitly scoped.
- Diagnostic inspection must preserve suppression reasons.
- OpenClaw and Hermes projections must agree on manifest-level semantics even if their artifacts differ.

### Acceptance Criteria

- Projection is no longer only "runtime bootstrap markdown."
- The manifest remains the durable explanation of why records entered or were suppressed.

---

## 10. Phase F: Broaden Canon And Proposal Roads Carefully

### Goal

Add expressive proposal operations only after current legality remains stable.

### Candidate Operations

- `archive`
- `reactivate`
- `merge`
- `split`
- `annotate`

### Work

- For each operation, define:
  - legal target contract
  - required evidence
  - governance gate behavior
  - canonical apply behavior
  - audit and recovery behavior
  - projection effect
- Start with one operation only, preferably `archive` or `annotate`, because they are less likely to collapse identity or contradiction law.

### Tests

- Operation rejected before schema/type/doc convergence.
- Operation cannot bypass active contradiction gates.
- Operation cannot mutate canon without ratification.
- Recovery replay must produce the same durable outcome.

### Acceptance Criteria

- Proposal vocabulary expands without weakening the current `create/revise/supersede` law.

---

## 11. Phase G: Make Procedural Memory Operational

### Goal

Move procedural memory from "claim kind accepted by governance" to a small executable lifecycle.

### Work

- Define a procedure candidate shape using existing claim/envelope semantics.
- Link procedure candidates to supporting episodes and failures.
- Add activation conditions as structured payload inside the current claim law, not as a parallel skill system.
- Add revise/supersede fixtures for procedure canon records.
- Add projection rendering that clearly labels procedure memory as governed memory, not executable code.

### Tests

- Procedure candidate must require supporting episode refs.
- Procedure proposal must follow normal governance gates.
- Superseded procedure must remain inspectable as history.
- Runtime projection must not treat procedure text as automatically executable authority.

### Acceptance Criteria

- Procedural memory becomes reusable knowledge under governance, not hidden automation.

---

## 12. Phase H: Mature Adapter Roads Without Moving Law Outward

### Goal

Make OpenClaw and Hermes real runtime boundaries while keeping adapters semantically subordinate to the core.

### Work

- Add adapter fixtures that round-trip:
  - non-canonical evidence-only writes
  - runtime-only writes
  - diagnostics feedback
  - owner review actions
  - manual contradiction review actions
  - latest projection selection with ambiguous contexts
- Add drift handling at adapter boundary as explicit diagnostics, not silent repair.
- Add adapter-specific projection artifact format only after common manifest semantics are tested.

### Tests

- OpenClaw and Hermes must pass the same authority-law fixture matrix.
- Adapter drift must emit diagnostics and preserve recovery behavior.
- No adapter may construct canon records directly.

### Acceptance Criteria

- Runtime portability is proven by shared semantics with adapter-specific packaging only at the edge.

---

## 13. Phase I: Build The Operational Session Continuity Road

### Goal

Implement `docs/OPERATIONAL-SESSION-MEMORY-RFC-V2.md` without turning resume or handoff packages into hidden memory authority.

### Work

- Add `working_memory_checkpoint` as an immutable runtime-local record.
- Store checkpoints under the existing `runtime/working-memory` region with explicit `runtime_instance_ref`, `runtime_session_ref`, `conversation_thread_ref`, `continuity_epoch`, and `generation`.
- Compile session packs as derived projection profiles using `ProjectionManifest` and `ProjectionArtifact`, not as runtime-authoritative memory blobs.
- Validate resume eligibility by refs, epoch, generation, read policy, and policy snapshot compatibility rather than TTL alone.
- Record `consumed` and `applied` as audit receipts or explicit receipt records that reference immutable checkpoint/session-pack artifacts.
- Forbid proposal extraction from `ConversationThread.summary`, `RuntimeSession.summary`, and freeform session-pack prose; proposal generation must dereference eligible upstream records instead.

### Tests

- Checkpoint supersession must preserve older checkpoint history without in-place mutation.
- A session pack must be reproducible from upstream refs and invalidated when required refs or policy compatibility break.
- Resume receipt recording must not mutate the original checkpoint or session pack.
- Proposal generation must reject summary prose and handoff text as direct proposal sources.
- Cross-runtime handoff must preserve the same upstream authority refs while allowing adapter-specific derived artifacts.

### Acceptance Criteria

- Runtime continuity becomes operational without creating shadow canon or shadow runtime authority.
- Session packs remain derived, reproducible, and subordinate to upstream records.
- The resume path preserves the same provenance and projection-read discipline as the rest of the kernel.

---

## 14. Phase J: Build The Eval Road Network

### Goal

Turn the current integrity checks into a broader eval harness.

### Eval Tracks

- contract convergence evals
- write-path recovery evals
- contradiction behavior evals
- projection fidelity evals
- wiki staleness evals
- authority legality evals
- longitudinal memory drift evals
- comparison against retrieval-only baselines

### Work

- Promote existing integrity eval patterns into a named eval runner.
- Add fixtures for multi-step flows across days/sessions.
- Add failure-mode evals from `docs/FAILURE-MODES.md`.
- Record eval outputs in a stable machine-readable format.

### Tests

- Evals must run in CI/test locally without requiring external runtimes.
- Eval failures must identify the contract broken, not just snapshot text drift.

### Acceptance Criteria

- The project can prove not only that the core works, but that the architecture outperforms simpler memory strategies on its chosen invariants.

---

## 15. Recommended Execution Order

1. Phase A: generic workflow roadbed
2. Phase B: non-canonical intake roads
3. Phase C: wiki maintenance road
4. Phase E: projection modes beyond runtime bootstrap
5. Phase D: policy and ontology roads
6. Phase G: procedural lifecycle
7. Phase I: operational session continuity road
8. Phase H: richer adapters
9. Phase F: broader proposal operations
10. Phase J: full eval network

This order intentionally delays broader adapter UX and proposal vocabulary until the core can carry more than the current preference trunk.

---

## 16. Near-Term First PR Slice

The first implementation slice should be small:

1. Document the generic workflow runner contract.
2. Introduce a typed `RegisteredIntakeProfile` contract.
3. Refactor only enough of the current preference flow to prove the runner can host it.
4. Add one `evidence_only` fixture using the same runner.
5. Preserve the existing adapter APIs.
6. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.

The first slice should not implement wiki maintenance, new adapter UX, or new proposal operations. Those become safer after the current trunk is reusable.

---

## 17. Non-Negotiable Acceptance Bar

Any road added by this plan must satisfy all of the following:

- docs, types, schemas, fixtures, and runtime validation tell the same story
- the flow is executable before adapter-specific surface area expands
- authenticated principal and evidence provenance stay separate
- projection inclusion and suppression are inspectable
- recovery can replay the legal action being resumed
- audit logs preserve the transition evidence
- canon remains reachable only through governance
- wiki remains editorial, never sovereign
