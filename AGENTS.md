# Cristalina v4 Development Guardrails

This file is a standing guardrail for development in this repository.

## Core Build Posture

Cristalina v4 should be developed in this order whenever possible:

1. define the problem, invariants, and layer boundaries
2. formalize contracts in docs
3. converge those contracts into types and schemas
4. prove the contracts with small executable flows and fixtures
5. implement the kernel logic behind those flows
6. only then expand adapters, retrieval, and broader product surfaces

This means the repository should move:

`docs -> types -> schemas -> fixtures -> kernel code -> adapters`

not:

`adapter UX -> runtime convenience -> hidden semantics -> retrofit architecture later`

## What This Means In Practice

- docs are expected to lead implementation by a small margin
- docs, schemas, and scaffold types must keep telling the same story
- fixtures should prove the intended write path before broad implementation expands
- kernel logic should migrate out of fixtures and into reusable core workflows as soon as the flow is understood
- adapters must consume the core semantics, not define them

## Reliability Standard

This project is considered on the right path when:

- documentation is becoming executable substrate
- the current phase is kernel implementation, not architecture-only
- end-to-end flows are executable before integrations become elaborate
- the core gets stronger before the surface area gets wider

## Deployment Trust Model

For the current product line, Cristalina v4 should be developed under this operating assumption unless a task explicitly says otherwise:

- the server environment is not exposed for arbitrary external-user access
- the humans who can interact with the agent are known to and authorized by the owner
- those humans are trusted collaborators of the owner, not hostile tenants or anonymous adversaries
- those collaborators still do not automatically carry owner authority; governance, ratification, and authority checks must continue to model that distinction explicitly

What this means in practice:

- prioritize correctness, recoverability, replayability, auditability, and authority legality over hardening for hostile multi-tenant abuse
- treat boundary and path-containment protections as integrity and operational-safety measures first, not as the primary security story
- do not assume participant-to-participant secrecy as a default product requirement unless a task or spec explicitly introduces it
- when reviewing or extending projection/read behavior, preserve the distinction between trusted collaboration and owner authority rather than silently collapsing them
- keep authenticated caller authority separate from event provenance: `speaker_ref` explains who produced evidence, while authenticated principals explain who is legally acting across governance boundaries

## Anti-Drift Rule

If a new change makes the project more impressive at the surface but weaker in:

- layer separation
- contract convergence
- legality of transitions
- provenance
- runtime validation

then the change is probably early or mis-layered.

## Session Phrases

This section is a cumulative memory of durable lessons from each work session in this repository.

Rules:

- each session may end with one or more short sentences added here when the work produced multiple distinct durable lessons
- each sentence should capture a durable engineering lesson, not a status update
- when a session adds multiple sentences, they should be the smallest non-overlapping set that captures the distinct lessons from that work
- prefer lessons about contracts, layer boundaries, legality of transitions, validation depth, and sequencing
- if a new sentence duplicates or supersedes an old one, rewrite or replace instead of growing noise
- keep the list readable and high-signal
- before proposing or reviewing a new session phrase, the agent should read all existing session phrases to avoid semantic duplication
- if a substantially similar phrase already exists and the session did not add a distinct new lesson, the correct outcome is to leave the session without a new phrase
- if a similar phrase already exists but the current session adds a distinct durable lesson worth preserving, the agent may suggest a new phrase candidate and should explain what is new about it
- after any commit in this repository, the agent should inspect this section for phrase coverage matching the current session, show the matching phrase or phrases if they exist, or explicitly say that no phrase is registered for the current session yet
- after any commit in this repository, the agent should also show the phrases from the 5 most recent sessions in the same message so the user can curate with recent context in view
- after any commit in this repository, the agent should count the current `AGENTS.md` size in characters with `wc -m < AGENTS.md`, show that number alongside the session phrases, and add exactly one of these status lines: `seu arquivo agents.md ainda esta com tamanho aceitavel` when the count is below 26214 characters, `alerta: seu arquivo agents.md esta chegando perto do limite recomendado` when the count is from 26214 through 32768 characters, or `arquivo agents.md grande demais. pode piorar a performance do agente.` when the count is above 32768 characters. The hard threshold follows the Codex `project_doc_max_bytes` default of 32 KiB as a practical character-count proxy for this mostly ASCII file, and the warning threshold is 80% of that limit.
- session phrases must be curated by the user; the agent may suggest candidates, but should not add, rewrite, or finalize a session phrase without explicit user approval

Current session phrases:

- 2026-04-27: Runtime bridges only stay operationally legal when convenience commands preserve the same store root, checkpoint identity, artifact uniqueness, build-artifact consistency, and explicit authority boundaries as the underlying core workflows.
- 2026-04-24: Store replay only stays trustworthy when loaders select records by declared kind instead of file shape, sidecar blobs remain downstream of metadata, and raw evidence ownership is serialized by content ref as well as workflow id.
- 2026-04-24: Conflict intake only stays legal when detected world contradictions cannot materialize without explicit contradiction records, and resolution application reauthenticates owner or system authority before mutating world truth.
- 2026-04-24: Projection boundaries only stay enforceable when direct manifest loads, flow-local replay, queue recovery, and reuse gates obey the same explicit consistency contract instead of treating derived artifacts as implicitly safe.
- 2026-04-23: Memory replay only stays correct when retries, duplicate deliveries, and recovery runs converge on the same durable state instead of producing semantically new events.
- 2026-04-23: Temporal memory only stays honest when observation time, persistence time, governance time, projection time, and resume time remain distinct and replay uses recorded chronology instead of fresh wall-clock assumptions.
- 2026-04-23: Durable memory only stays current when supersession, expiry, and retirement deactivate old truth across canon, wiki, retrieval, and projections without making history disappear.
- 2026-04-23: Session continuity only stays legal when checkpoints remain authoritative, handoff packs stay derived, and resume receipts prove continuity without becoming a shadow write path.
- 2026-04-23: Derived artifacts only stay trustworthy when policy, compiler, index, and generation versions are explicit enough to detect stale outputs, replay old results, and migrate without silent semantic drift.
- 2026-04-23: Cross-subsystem reads only stay coherent when mixed-state tolerance versus snapshot requirement is explicit, diagnosable, and enforced at the read boundary instead of assumed from timing.
- 2026-04-22: Typed references only preserve provenance when every graph edge, retrieval candidate, and adapter feedback path resolves identity from declared records or fails into diagnostics instead of inventing authority from ids or legacy names.
- 2026-04-22: Adapter parity only stays correct when runtime-neutral flows read adapter identity from persisted manifests, materialize projections under the declared adapter, and prove Hermes and OpenClaw through the same queue, projection, and authority contracts.
- 2026-04-22: Memory correctness only closes when create paths cannot reuse canonical identity, retrieval budgets are spent after legality suppression, and non-canonical intake can replay or repair partial evidence writes.
- 2026-04-22: Workflow hardening only closes when suppressed reads drop payload previews, non-canonical reuse proves every required artifact including raw evidence, and wiki maintenance serializes recoverable materialization across records, projections, index, and audit.
- 2026-04-22: Retrieval hardening only closes when recipe scope, editorial authority, external mappings, read policy, and index checksums are enforced at the candidate boundary instead of trusted from upstream metadata.
- 2026-04-21: Native vector retrieval only strengthens Cristalina when non-canonical roads, wiki maintenance, symbolic anchors, retrieval law, and projection traces all preserve the authority of the upstream records they make easier to find.
- 2026-04-21: Wiki memory only stays coherent when maintenance events, lifecycle metadata, lint diagnostics, and browser projections remain downstream of upstream evidence and governance-owned promotion.
- 2026-04-21: Non-canonical intake only becomes a real road when raw evidence, runtime context, diagnostics, and projection visibility prove their routing without silently creating canon or wiki truth.
- 2026-04-21: Generic runners only become reusable roadbed when registered profiles declare their semantic fingerprint while shared store machinery owns durability, replay, validation, and reuse law.
- 2026-04-20: Adapter and governance hardening only stay honest when write-through entrypoints require authenticated principals in the public contract, terminal review paths persist authenticated authority in the durable contract, queued recovery replays the exact journal for the legal action being resumed, manual contradiction review obeys the same explicit authority law as owner-facing queue actions, flow reuse invalidates when authenticated authority changes, system actions carry stable machine identity instead of nominal role labels, and adapter-facing tests prove the contract at the same boundary the workspace validates.
- 2026-04-17: Write-path hardening only closes when raw ingress paths obey the same root-scoped containment law as authoritative storage, durability covers append-style audit replay as well as record replacement, and clean builds prove the current source instead of stale artifacts.
- 2026-04-17: Governance and recovery hardening only close when terminal review outcomes are explicit in the persisted contract, validation audit phases remain append-only across the same proposal lifecycle, and subject identity is carried by stable authority refs instead of adapter labels.
- 2026-04-17: Conflict and projection hardening only close when deferred promotion replays the current world-conflict gate at approval time, manual-review contradictions persist as explicit queue state with a legal replayable exit, and derived artifact paths and latest-view selection both stay bound to the same root-scoped and context-scoped authority as authoritative recovery and storage.
- 2026-04-17: Shared-runtime group support only stays coherent when authority law, review queue state, projection readers, and reusable test fixtures all execute the same contract instead of re-encoding it per adapter or test.
- 2026-04-17: Core hardening only closes when authoritative writes are serialized and recoverable, audit replay is journaled with the same recovery contract, and promotion executes at the same canon entrypoints that verify the acting principal and preserve canonical uniqueness under concurrency.
- 2026-04-16: Replay hardening only closes the contract when recovery artifacts stay root-scoped, projection materialization is context-addressable instead of singleton global state, and governance verifies target references by full identity rather than id alone.
- 2026-04-15: Write-path hardening only closes the contract when authoritative persistence can recover from partial materialization, derived artifacts are replay-verified against source state, and schema validation treats local refs and absent fields with the same semantics as persisted JSON.
- 2026-04-13: Hardening should first eliminate drift between docs, schemas, and executable core before expanding proposal operations, adapters, or projection surfaces.
- 2026-04-13: Runtime identity, episodes, and disposition invariants should become executable in the same flow so world structure and projection fidelity harden together instead of drifting apart.
- 2026-04-13: Applied contradiction resolution only closes the contract when the store persists the temporal change, the projection recompiles from it, and the losing claim remains inspectable as history.
- 2026-04-13: Projection discipline only becomes reliable when read policy, suppression traceability, and runtime identity legality align across docs, schemas, validation, and executable core flows.
- 2026-04-13: Conflict hardening only closes the write contract when world and canon share the same semantic slot, promotion blocks on active contradictions, and intake provenance survives replay unchanged.
