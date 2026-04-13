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
- after any commit in this repository, the agent should explicitly remind the user to review whether the current session produced a new session phrase or a rewrite of an existing one
- session phrases must be curated by the user; the agent may suggest candidates, but should not add, rewrite, or finalize a session phrase without explicit user approval

Current session phrases:

- 2026-04-13: Hardening should first eliminate drift between docs, schemas, and executable core before expanding proposal operations, adapters, or projection surfaces.
