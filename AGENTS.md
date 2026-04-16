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

- each session should end with exactly one short sentence added here
- each sentence should capture a durable engineering lesson, not a status update
- prefer lessons about contracts, layer boundaries, legality of transitions, validation depth, and sequencing
- if a new sentence duplicates or supersedes an old one, rewrite or replace instead of growing noise
- keep the list readable and high-signal
- before proposing or reviewing a new session phrase, the agent should read all existing session phrases to avoid semantic duplication
- if a substantially similar phrase already exists and the session did not add a distinct new lesson, the correct outcome is to leave the session without a new phrase
- if a similar phrase already exists but the current session adds a distinct durable lesson worth preserving, the agent may suggest a new phrase candidate and should explain what is new about it
- after any commit in this repository, the agent should inspect this section for a phrase matching the current session, show it if it exists, or explicitly say that no phrase is registered for the current session yet
- after any commit in this repository, the agent should also show the phrases from the 5 most recent sessions in the same message so the user can curate with recent context in view
- session phrases must be curated by the user; the agent may suggest candidates, but should not add, rewrite, or finalize a session phrase without explicit user approval

Current session phrases:

- 2026-04-15: Write-path hardening only closes the contract when authoritative persistence can recover from partial materialization, derived artifacts are replay-verified against source state, and schema validation treats local refs and absent fields with the same semantics as persisted JSON.
- 2026-04-13: Hardening should first eliminate drift between docs, schemas, and executable core before expanding proposal operations, adapters, or projection surfaces.
- 2026-04-13: Runtime identity, episodes, and disposition invariants should become executable in the same flow so world structure and projection fidelity harden together instead of drifting apart.
- 2026-04-13: Applied contradiction resolution only closes the contract when the store persists the temporal change, the projection recompiles from it, and the losing claim remains inspectable as history.
- 2026-04-13: Projection discipline only becomes reliable when read policy, suppression traceability, and runtime identity legality align across docs, schemas, validation, and executable core flows.
- 2026-04-13: Conflict hardening only closes the write contract when world and canon share the same semantic slot, promotion blocks on active contradictions, and intake provenance survives replay unchanged.
