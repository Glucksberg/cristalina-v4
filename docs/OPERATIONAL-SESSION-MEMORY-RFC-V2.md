# Cristalina v4
## Operational Session Memory RFC v2

**Status:** Draft  
**Purpose:** Define resume and handoff continuity for runtime sessions without weakening Cristalina's authority boundaries.

---

## 1. Why v2 exists

Cristalina v4 already has the right architectural split:

- `runtime/` for live operational state
- `world/` for structured evolving state
- `canon/` for governed durable truth
- `wiki/` for editorial synthesis
- `derived/` for projections and runtime-facing packages

What is still missing is a tight continuity contract for session resume, compaction recovery, and cross-runtime handoff.

The first draft pointed in a useful direction, but it made one dangerous move: it treated handoff packaging as if it were a runtime-authoritative memory object. That is exactly the kind of drift warned about in `docs/FAILURE-MODES.md` and rejected by `docs/LEGAL-TRANSITIONS.md`.

v2 keeps the operational benefit while restoring the architecture:

- runtime checkpoints stay in `runtime/`
- handoff packaging moves to `derived/`
- summaries remain summaries, not shadow memory law
- proposal generation may only operate on referenced upstream objects, never on prose recap text

---

## 2. Binding decisions

### D-OSM-001. `working_memory_checkpoint` stays in `runtime/`

Cristalina should introduce a `working_memory_checkpoint` record as a runtime-local continuity primitive.

It belongs in `runtime/` because it captures the running mind's attached state, not governed truth and not an adapter projection.

### D-OSM-002. There is no runtime-authoritative `handoff_packet`

v2 intentionally drops the idea of a runtime-authoritative handoff blob.

Handoff packaging should be compiled as a **derived session pack** using the existing projection model:

- a `ProjectionManifest` stored under `derived/manifests/`
- one or more `ProjectionArtifact`s materialized under `derived/openclaw/` or `derived/hermes/`
- stable `upstream_refs`
- explicit projection/read metadata such as `read_policy_version` and `policy_snapshot_ref`

This keeps handoff packaging useful without letting it become a second runtime memory authority.
The manifest is still a governed projection record.
The pack's memory semantics remain downstream of its upstream refs, not of the packaged prose.

### D-OSM-003. Do not introduce a third summary object

The current model already has:

- `ConversationThread.summary`
- `RuntimeSession.summary`

v2 should not add a separate `runtime_session_summary` record.

Instead, summary semantics should be narrowed:

- `ConversationThread.summary` = short mutable synopsis of one thread's message arc
- `RuntimeSession.summary` = short mutable synopsis of the session's objective and outcome
- session packs may quote these summaries for readability, but those quotes are only operator/runtime aids

This avoids overlap and keeps prose summaries clearly non-authoritative.

### D-OSM-004. Proposal extraction is forbidden from prose summaries and handoff text

The system must not generate proposals from:

- `ConversationThread.summary`
- `RuntimeSession.summary`
- freeform handoff notes inside a session pack
- any wiki prose recap

Proposal generation may only operate on referenced upstream objects such as:

- `Observation`
- `WorldClaim`
- `WikiClaim`
- `CanonicalMemoryObject`
- `Contradiction`
- existing `Proposal` or `DispositionRecord`

If a summary names a candidate claim, the compiler must follow the referenced upstream object and extract from that object, not from the prose itself.

### D-OSM-005. Validity is defined by refs plus epoch/generation, not TTL alone

TTL can be an operator hint.

It is not the authority rule.

A checkpoint or session pack is valid only when:

- its `runtime_instance_ref`, `runtime_session_ref`, and `conversation_thread_ref` still match the resume target
- all required `upstream_refs` still resolve
- its `continuity_epoch` matches the active resume epoch
- no later generation in the same epoch supersedes it
- its `read_policy_version` and, when present, `policy_snapshot_ref` remain compatible with the active resume/compiler policy

A checkpoint or pack becomes invalid when:

- the runtime explicitly starts a new continuity epoch
- a later checkpoint supersedes it
- required upstream refs are missing, rejected, or superseded in a way that breaks the resume contract
- the compiler cannot reproduce the pack from current upstream objects

TTL may still trigger warnings, but it must not be the sole validity boundary.

### D-OSM-006. Snapshots are immutable; consumption and application are receipts

`working_memory_checkpoint` records should be immutable point-in-time snapshots.

New snapshots supersede old ones by `continuity_epoch` + `generation`, not by in-place mutation.

Derived session packs should also be immutable. If a runtime resumes from a pack, the system should record that as a **receipt**:

- `consumed` = a runtime loaded that pack for resume
- `applied` = projected fragments from that pack were actually attached or materialized into runtime state

Those states should be recorded via audit/change entries or another explicit receipt object that references the immutable pack/checkpoint. They should not rewrite the pack itself.

---

## 3. Proposed artifacts and placement

| Artifact | Layer | Authority | Purpose |
|---|---|---|---|
| `working_memory_checkpoint` | `runtime/` | runtime-local only | immutable snapshot of active operational state before compaction, pause, or handoff compilation |
| session summary fields (`ConversationThread.summary`, `RuntimeSession.summary`) | `runtime/` | non-authoritative prose | low-token recap for operators and resume UX |
| session pack (`ProjectionManifest` + `ProjectionArtifact`s) | `derived/` | governed projection metadata + upstream semantic authority | compiled resume/handoff package for a specific runtime or target audience |

Recommended placement:

- `runtime/working-memory/checkpoints/<runtime-session-id>/<checkpoint-id>.json`
- `derived/manifests/<manifest-id>.json` for the `ProjectionManifest`
- `derived/openclaw/session-packs/<runtime-session-id>/<artifact-id>.json` for OpenClaw materializations
- `derived/hermes/session-packs/<runtime-session-id>/<artifact-id>.json` for Hermes materializations
- optional navigation indexes under `derived/manifests/`

This matches the storage thesis in `docs/STORAGE-MODEL.md` and the projection boundary in `packages/core/src/storage.ts`.

---

## 4. Minimal contract shape

### 4.1 `working_memory_checkpoint`

Suggested minimum fields, following the repo's envelope style:

- envelope fields from `RecordEnvelope`
- `kind: "working_memory_checkpoint"`
- `layer: "runtime"`
- `authoritative_home: "runtime"`
- `runtime_instance_ref`
- `runtime_session_ref`
- `conversation_thread_ref`
- `continuity_epoch`
- `generation`
- `supersedes_ref` (optional)
- `checkpoint_reason` (`pre_compact`, `pause`, `explicit_handoff`, `safety_snapshot`, `shutdown`)
- `active_block_refs`
- `recent_observation_refs`
- `pending_proposal_refs`
- `diagnostic_refs`
- `open_contradiction_refs`
- `objective`
- `must_resume_refs`
- `do_not_assume_refs`

Important constraint: `must_resume_refs` and `do_not_assume_refs` should prefer references to upstream objects over prose bullets whenever possible.

### 4.2 Session pack

A session pack is not a new memory-law object. It is a derived bundle compiled for resume.

It should be represented as:

- a `ProjectionManifest` with a dedicated projection profile such as `session_resume_v2`, stored in `derived/manifests/`
- one or more `ProjectionArtifact`s for runtime/world/wiki/canon fragments as needed, materialized in the adapter-specific derived directory
- exact `upstream_refs`
- explicit `runtime_session_ref`, `conversation_thread_ref`, `policy_snapshot_ref`, `read_policy_version`, and source checkpoint ref in manifest context

A pack may contain readable notes, but those notes are explanatory only.

The authoritative continuity source remains the upstream objects it references.

---

## 5. Resume and handoff flow

### 5.1 Checkpoint write

1. Runtime is about to compact, pause, or hand off.
2. Core writes a new immutable `working_memory_checkpoint` in `runtime/`.
3. The checkpoint receives the current `continuity_epoch` and next `generation`.
4. Older checkpoints in the same epoch remain historical but are superseded.

### 5.2 Session-pack compilation

1. Adapter or operator requests a resumable handoff package.
2. Core resolves the latest valid checkpoint for the target session/thread/epoch.
3. Core resolves referenced runtime, world, canon, wiki, governance, and diagnostic objects.
4. Core compiles a session pack under `derived/` as a manifest plus artifacts.
5. The pack is usable only as long as its upstream refs remain valid.

### 5.3 Resume

1. Runtime requests the latest valid session pack for its target profile.
2. Core verifies epoch/generation and upstream refs.
3. Runtime reads the pack and materializes the referenced fragments.
4. The system records a `consumed` receipt.
5. If the runtime actually re-attaches or restores the projected state, the system records an `applied` receipt.
6. Runtime continues and later emits a new checkpoint or projection manifest as needed.

---

## 6. Authority rules

The following are prohibited:

- `runtime/working_memory_checkpoint -> canon`
- summary text -> `Proposal`
- session pack prose -> `Proposal`
- `derived/` session pack -> authoritative runtime update without ref resolution
- `derived/` session pack -> `canon`

The following are allowed:

- checkpoint refs -> projection compilation
- checkpoint refs -> runtime resume
- session packs may expose upstream refs for dereference and inspection
- dereferenced upstream runtime/world/wiki/canon/governance records -> normal proposal generation, if those original upstream objects are legal proposal inputs
- runtime observations or world/wiki outputs -> governance, under the existing legal transition model

This keeps v2 aligned with:

- `docs/ARCHITECTURE.md`
- `docs/STORAGE-MODEL.md`
- `docs/INFORMATION-FLOW.md`
- `docs/LEGAL-TRANSITIONS.md`
- `docs/DECISIONS.md`

---

## 7. Failure guards

### 7.1 Prevent runtime packaging from becoming memory law

A session pack must never be edited as if it were the source of truth.

If a pack is hand-edited, the next compile should overwrite or supersede it from upstream refs.

### 7.2 Prevent proposal inflation from prose

If a summary sentence has no stable upstream object behind it, it is not eligible for proposal generation.

No exceptions.

### 7.3 Prevent stale-but-valid confusion

A pack may be old yet still structurally valid.

A pack may also be recent but invalid because the epoch changed or upstream refs were superseded.

The compiler and resume path must distinguish:

- freshness warnings
- structural invalidation
- supersession by newer generation

### 7.4 Prevent summary overlap drift

If a detail matters enough to drive resume or governance, it should exist as a referenced upstream object or checkpoint field.

It should not live only in a mutable prose summary.

---

## 8. Implementation direction

### Phase 1

- add `working_memory_checkpoint` to core types and schema coverage
- add runtime storage path for checkpoints
- define `continuity_epoch` and `generation` semantics in the kernel

### Phase 2

- add session-pack compilation as a projection profile using existing `ProjectionManifest` / `ProjectionArtifact` machinery
- emit reproducible session packs under `derived/openclaw/` and `derived/hermes/`
- add derived indexes for latest resumable sessions

### Phase 3

- add audit receipts for `consumed` and `applied`
- add validation rules that reject proposal extraction from summary prose
- add fixtures covering checkpoint supersession, epoch invalidation, and cross-runtime resume

---

## 9. Recommendation

Implement operational/session continuity in v2 with one new authoritative runtime primitive and zero new shadow-authority prose objects:

- keep `working_memory_checkpoint` in `runtime/`
- keep summaries narrow and non-authoritative
- compile handoff packages only in `derived/`
- make refs, epoch, generation, and supersession determine validity
- treat consumption/application as explicit receipts on immutable artifacts

That gives Cristalina the operational continuity it wants without breaking the architecture that makes the repo worth building in the first place.
