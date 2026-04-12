# Contributing

Cristalina v4 is currently in an architecture-first stage.

Current contribution priorities:

- improve clarity of contracts
- identify contradictions between docs
- challenge layer ownership assumptions
- refine eval criteria
- refine adapter boundaries

Before major implementation changes, contributors should first align with:

- `docs/ARCHITECTURE.md`
- `docs/STORAGE-MODEL.md`
- `docs/CORE-TYPES.md`
- `docs/LEGAL-TRANSITIONS.md`

Rule of thumb:

- notes may be rough
- docs should be precise
- code should only be added when the relevant contracts are clear enough

Preferred development route:

1. docs and invariants
2. types and schemas
3. executable fixtures and MVP flows
4. reusable kernel workflows
5. adapters and broader product surfaces

Guardrail:

- avoid moving semantics first into fixtures, adapters, or UI surfaces and only documenting them later
- prefer making the core more lawful before making the system more broad

License:

- Apache-2.0
