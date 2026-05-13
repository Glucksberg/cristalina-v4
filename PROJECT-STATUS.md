# Project Status

**Current status:** Executable governed-memory kernel with a live native Hermes
memory provider under controlled long-run testing; OpenClaw remains on the
bridge/hook parity path until the Hermes loop is satisfactory.

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
- thin Hermes adapter package with projection reads and authenticated
  write-through
- clean workspace typecheck from a fresh no-`dist` state
- shared dual-runtime smoke fixture against the same store
- initial `@cristalina-v4/cli` package with `cristalina` command, config loader,
  doctor/status surface, and smoke wrapper
- versioned local config writer with non-interactive setup and interactive TTY
  prompts for the first operator flow
- runtime-neutral event bridge for OpenClaw and Hermes preference, feedback,
  diagnostic, review, projection-refresh, and declared continuity events
- local OpenClaw installer command and metadata writer
- local Hermes installer command with native `memory.provider=cristalina`
  default mode and explicit bridge fallback
- native Hermes provider files, provider metadata, recognition/prefetch path,
  post-turn evidence sync, and background bridge dispatch
- runtime-managed nightly memory cycle for Hermes: deterministic memory
  consolidation, source-neutral semantic maturation through the Hermes model
  harness, and deterministic candidate promotion
- progressive maturation backlog tracking so already-matured observation refs
  are skipped unless later support/conflict justifies reopening
- corroborated canon promotion for low-risk non-owner semantic slots, with
  owner-scoped, identity, authorization, preference, and higher-risk claims
  staying review-gated
- installation registry plus `cristalina update` flow for refreshing the
  checkout and reapplying registered runtime installations
- generated OpenClaw and Hermes hook descriptors plus hook scripts that call
  `cristalina bridge event` through `CRISTALINA_EVENT_PATH`
- versioned OpenClaw and Hermes runtime-event fixtures for the shared bridge
  contract
- runtime-wiring smoke fixture that installs both runtimes locally, sends
  OpenClaw and Hermes events through the CLI bridge, validates projection reads,
  and exercises checkpoint -> session-pack -> resume receipt continuity
- runtime preflight command that reports config validity, available local
  commands, selected OpenClaw/Hermes roots, generated hook targets, and concrete
  install commands before touching real runtime config
- runtime hook-map command that turns an installed descriptor and executable
  hook script into a Cristalina-owned mapping manifest for the real runtime
  config path
- runtime event-template and event-check commands that generate or validate
  `cristalina.runtime_bridge_event.v1` files before a runtime hook calls the
  bridge
- runtime event-verify command that validates one OpenClaw event and one Hermes
  event, sends both through the bridge, and reports the shared store writes
- projection verify command that proves `projection list` and manifest loading
  can see compatible OpenClaw and Hermes runtime bootstrap projections from the
  same store
- session-pack verify-handoff command that proves OpenClaw checkpoint -> Hermes
  session-pack manifest -> Hermes resume receipt continuity
- public session-continuity helpers plus bridge/CLI checkpoint and session-pack
  commands
- operator inspection commands for projections, reviews, diagnostics, store
  summary, and inspect-only recovery planning
- runtime wiring runbook for install, inspect, review, recover, and handoff

What is next:

- continue the Hermes soak test across normal chat, Telegram gateway operation,
  heartbeats, AI Pulse jobs, provider prefetch, evidence sync, nightly
  consolidation/maturation/promotion, missed-run recovery, diagnostics, and
  owner-review surfacing
- harden the public one-line installer and minimal `cristalina config` UX before
  publishing a package
- refine the runtime-facing review digest for owner-scoped claims that should
  not be auto-ratified
- keep Farol read-only and development-only while using it to catch congestion,
  stale projections, invalid events, skipped cycles, and semantic-maturation
  drift
- add OpenClaw installer/provider parity after the Hermes product loop is
  reliable enough to copy the pattern intentionally

What does not exist yet:

- polished runtime-specific UX beyond the current Hermes provider and thin
  adapter surfaces
- a published package or final public installer
- automatic editing of native OpenClaw config files
- OpenClaw native-provider parity
- hosted synchronization or hostile multi-tenant deployment hardening
- a product dependency on Farol; Farol is only a development monitor

The project is past the bridge-demo stage for Hermes. The central question now
is whether the native provider plus nightly memory cycle can keep producing
useful wiki/canon/proposal state over several days of ordinary runtime evidence
without becoming too conservative, too noisy, or too dependent on manual CLI
operation.
