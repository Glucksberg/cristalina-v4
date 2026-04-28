# Project Status

**Current status:** Executable kernel baseline with thin authenticated Hermes and OpenClaw boundaries; ready for controlled runtime wiring tests through generated hook contracts

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
- generated OpenClaw and Hermes hook descriptors plus hook scripts that call
  `cristalina bridge event` through `CRISTALINA_EVENT_PATH`
- versioned OpenClaw and Hermes runtime-event fixtures for the shared bridge
  contract
- runtime-wiring smoke fixture that installs both runtimes locally, sends
  OpenClaw and Hermes events through the CLI bridge, validates projection reads,
  and exercises checkpoint -> session-pack -> resume receipt continuity
- public session-continuity helpers plus bridge/CLI checkpoint and session-pack
  commands
- operator inspection commands for projections, reviews, diagnostics, store
  summary, and inspect-only recovery planning

What is next:

- point the generated hook descriptors at real OpenClaw/Hermes config files
  once the runtime-side hook locations are known
- run the runtime-wiring smoke against a local OpenClaw session and a local
  Hermes session instead of the fixture event files
- richer proposal operations only after the first live loop proves the need

What does not exist yet:

- polished runtime-specific UX beyond the current thin authenticated write-through surfaces
- a live-session bridge/daemon that translates real Hermes and OpenClaw events into adapter calls
- production-style operator docs for start, inspect, review, recover, and handoff

This project is now ready for controlled runtime wiring tests. The main
remaining work is connecting the generated hook contract to the real
OpenClaw/Hermes hook points and deciding whether the first live bridge should
stay hook-driven or become a daemon.
