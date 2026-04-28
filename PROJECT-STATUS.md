# Project Status

**Current status:** Executable kernel baseline with thin authenticated Hermes and OpenClaw boundaries; ready for a controlled first live-session bridge

What already exists:

- project thesis
- architectural layers
- hardening plan
- object-envelope contract
- runtime-identity contract
- disposition and consolidation contract
- storage model
- base types
- legal transitions
- MVP flow
- store manifest and store IO
- core validation layer
- governance engine baseline
- canonical apply path
- projection compiler baseline with runtime read policy
- contradiction detection, review, resolution, canonical follow-up, and projection recompilation
- non-canonical intake for evidence-only, runtime-only, and diagnostic-only flows
- wiki maintenance and memory browser projection
- retrieval, vector, external-candidate, and maintenance/eval boundaries
- working-memory checkpoints, session packs, and resume receipts
- executable core fixtures and tests
- thin OpenClaw adapter package with projection reads and authenticated write-through
- thin Hermes adapter package with projection reads and authenticated write-through
- clean workspace typecheck from a fresh no-`dist` state
- shared dual-runtime smoke fixture against the same store
- initial `@cristalina-v4/cli` package with `cristalina` command, config loader,
  doctor/status surface, and smoke wrapper
- versioned local config writer with non-interactive setup and interactive TTY
  prompts for the first operator flow
- runtime-neutral event bridge for OpenClaw and Hermes preference, feedback,
  diagnostic, review, projection-refresh, and declared continuity events
- local OpenClaw installer command and metadata writer
- local Hermes installer command sharing the OpenClaw metadata contract
- public session-continuity helpers plus bridge/CLI checkpoint and session-pack
  commands

What is next:

- projection refresh and inspection commands for operators
- runtime-facing review and diagnostic summaries
- richer proposal operations only after the first live loop proves the need

What does not exist yet:

- polished runtime-specific UX beyond the current thin authenticated write-through surfaces
- a live-session bridge/daemon that translates real Hermes and OpenClaw events into adapter calls
- production-style operator docs for start, inspect, review, recover, and handoff

This project is now close to first wiring. The main remaining work is runtime glue and operator ergonomics, not a new memory law.
