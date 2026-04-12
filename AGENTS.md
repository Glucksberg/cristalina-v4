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
