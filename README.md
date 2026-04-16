# Cristalina v4

This directory is the official working area for the next-generation Cristalina repository line.

Cristalina v4 is being designed as a new memory architecture rather than a direct merge of older products.

Its working thesis is:

`raw sources + runtime self + temporal world model + governed canonical memory + persistent knowledge wiki`

## Scope

This repository line is intended to produce:

- a runtime-agnostic governed memory core
- a first-class OpenClaw integration
- a first-class Hermes Agent integration

## Start Here

1. [docs/NEXT-GEN-MEMORY-SYNTHESIS.md](/home/dev/projects/cristalina-v4/docs/NEXT-GEN-MEMORY-SYNTHESIS.md)
2. [docs/VISION.md](/home/dev/projects/cristalina-v4/docs/VISION.md)
3. [docs/ARCHITECTURE.md](/home/dev/projects/cristalina-v4/docs/ARCHITECTURE.md)
4. [docs/HARDENING-PLAN.md](/home/dev/projects/cristalina-v4/docs/HARDENING-PLAN.md)
5. [docs/OBJECT-ENVELOPE.md](/home/dev/projects/cristalina-v4/docs/OBJECT-ENVELOPE.md)
6. [docs/RUNTIME-IDENTITY.md](/home/dev/projects/cristalina-v4/docs/RUNTIME-IDENTITY.md)
7. [docs/DISPOSITION-AND-CONSOLIDATION.md](/home/dev/projects/cristalina-v4/docs/DISPOSITION-AND-CONSOLIDATION.md)
8. [docs/ROADMAP.md](/home/dev/projects/cristalina-v4/docs/ROADMAP.md)
9. [docs/STORAGE-MODEL.md](/home/dev/projects/cristalina-v4/docs/STORAGE-MODEL.md)
10. [docs/CORE-TYPES.md](/home/dev/projects/cristalina-v4/docs/CORE-TYPES.md)
11. [docs/LEGAL-TRANSITIONS.md](/home/dev/projects/cristalina-v4/docs/LEGAL-TRANSITIONS.md)
12. [docs/INFORMATION-FLOW.md](/home/dev/projects/cristalina-v4/docs/INFORMATION-FLOW.md)
13. [docs/MVP-FLOW-001.md](/home/dev/projects/cristalina-v4/docs/MVP-FLOW-001.md)
14. [docs/MVP-SPEC.md](/home/dev/projects/cristalina-v4/docs/MVP-SPEC.md)
15. [docs/INSPIRATION-AND-COMPATIBILITY.md](/home/dev/projects/cristalina-v4/docs/INSPIRATION-AND-COMPATIBILITY.md)
16. [docs/ANCESTOR-CROSSWALK.md](/home/dev/projects/cristalina-v4/docs/ANCESTOR-CROSSWALK.md)
17. [docs/MODULARIZATION-PLAN.md](/home/dev/projects/cristalina-v4/docs/MODULARIZATION-PLAN.md)
18. [docs/MODULE-FLOWS.md](/home/dev/projects/cristalina-v4/docs/MODULE-FLOWS.md)
19. [docs/REUSE-MATRIX.md](/home/dev/projects/cristalina-v4/docs/REUSE-MATRIX.md)
20. [docs/KNOWLEDGE-WIKI-LAYER.md](/home/dev/projects/cristalina-v4/docs/KNOWLEDGE-WIKI-LAYER.md)
21. [docs/ADAPTER-CONTRACTS.md](/home/dev/projects/cristalina-v4/docs/ADAPTER-CONTRACTS.md)
22. [docs/MODEL-DEPENDENCY-MAP.md](/home/dev/projects/cristalina-v4/docs/MODEL-DEPENDENCY-MAP.md)
23. [docs/DECISIONS.md](/home/dev/projects/cristalina-v4/docs/DECISIONS.md)
24. [docs/GLOSSARY.md](/home/dev/projects/cristalina-v4/docs/GLOSSARY.md)
25. [docs/NON-GOALS.md](/home/dev/projects/cristalina-v4/docs/NON-GOALS.md)
26. [docs/USE-CASES.md](/home/dev/projects/cristalina-v4/docs/USE-CASES.md)
27. [docs/EVALS.md](/home/dev/projects/cristalina-v4/docs/EVALS.md)
28. [docs/FAILURE-MODES.md](/home/dev/projects/cristalina-v4/docs/FAILURE-MODES.md)
29. [docs/WSL-DEVELOPMENT.md](/home/dev/projects/cristalina-v4/docs/WSL-DEVELOPMENT.md)

## Repository Layout

- `docs/` architecture, flow, compatibility, and spec documents
- `schemas/` stable object and adapter schemas
- `notes/` reverse-engineering and translation notes
- `packages/core` governed memory core
- `packages/openclaw-adapter` OpenClaw integration
- `packages/hermes-adapter` Hermes Agent integration

## Environment

- Use a single OS environment per checkout.
- Prefer WSL-only development and keep the repo under the Linux filesystem.
- See [docs/WSL-DEVELOPMENT.md](/home/dev/projects/cristalina-v4/docs/WSL-DEVELOPMENT.md) for the migration checklist and recovery steps.
