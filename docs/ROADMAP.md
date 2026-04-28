# Cristalina v4
## Roadmap

**Status:** Active Draft
**Updated:** 2026-04-28
**Current posture:** executable memory kernel with thin Hermes and OpenClaw
boundaries; planning the installable runtime bridge

---

## 1. Roadmap Principle

Cristalina v4 has moved past the architecture-only stage.

The core already has enough executable law to support a controlled first
runtime loop. The next work is not a new memory model. The next work is turning
the existing kernel and adapters into something installable, configurable, and
usable from one OpenClaw session and one Hermes session without making either
runtime define Cristalina's memory semantics.

The build order still remains:

`docs -> types -> schemas -> fixtures -> kernel code -> adapters`

For the next phase, that means:

1. finish this roadmap-level master plan
2. create an independent detailed plan for each master-plan step
3. only then execute the steps

No implementation should begin until the planning pass for the relevant step is
explicit enough to define contracts, tests, and exit criteria.

---

## 2. Current Executable Baseline

Already executable:

- core storage layout, manifest, record IO, validation, recovery journals, and
  append-style audit/validation logs
- raw source intake, runtime observations, world claims, wiki pages/claims,
  disposition records, proposals, ratifications, canon records, diagnostics,
  projection artifacts, and projection manifests
- conversation preference write path from raw/runtime evidence through world,
  wiki, governance, canon, and runtime projection
- authenticated principal checks separated from `speaker_ref` provenance
- owner-ratification, rejection, expiration, and manual contradiction review
  queues
- active world contradiction detection, explicit contradiction records,
  accepted/applied contradiction resolutions, canonical follow-up, and
  projection recompilation
- projection read policy with runtime/owner identity scoping, suppression
  metadata, review traces, diagnostics, and retrieval traces
- non-canonical intake for `evidence_only`, `runtime_only`, and
  `diagnostic_only`
- wiki maintenance and read-only memory browser projection
- native deterministic retrieval, lexical/vector/hybrid retrieval, retrieval
  audits/evals, vector maintenance, external candidate normalization, and
  provider/export boundaries
- working-memory checkpoints, session packs, and session resume receipts as
  the first operational continuity slice
- OpenClaw and Hermes adapter packages with projection reads, authenticated
  write-through, non-canonical write-through, drift diagnostics, and queue
  actions
- public API boundary that keeps raw persistence and canon mutation primitives
  behind the internal entrypoint

This baseline is strong enough for runtime wiring. It is not yet an installable
product loop.

---

## 3. Current Blocking Gaps

The main gaps before a seamless OpenClaw/Hermes experience are operational, not
architectural:

- no installable public package or `bin` entrypoint
- no `cristalina` CLI
- no one-line installer for OpenClaw
- no one-line installer for Hermes
- no runtime bridge or daemon translating real runtime events into adapter calls
- no configuration menu in the style of `openclaw config`
- no stable runtime config schema for store root, owner, agent, authenticated
  principal, runtime instance, session, thread, projection policy, and review
  behavior
- no shared dual-runtime smoke command proving one OpenClaw session and one
  Hermes session against the same store
- session resume objects exist in the core, but runtime projection loaders still
  focus on bootstrap projections rather than session-pack consumption
- workspace typecheck currently depends on `packages/core/dist` existing before
  adapter typecheck runs
- operator docs are still aimed at developers inspecting store internals rather
  than at running a local Cristalina installation

---

## 4. Target Product Shape

The desired first product shape is:

```bash
curl -fsSL https://.../install-openclaw.sh | sh
curl -fsSL https://.../install-hermes.sh | sh
```

After installation:

- Cristalina is available as a local command named `cristalina`
- each installer can discover or ask for the relevant runtime location
- if required configuration is missing, the installer opens `cristalina config`
- the config menu writes a validated local config
- OpenClaw and Hermes can write runtime evidence through their adapters
- OpenClaw and Hermes can load their latest compatible Cristalina projection
- pending reviews and diagnostics are visible without manually browsing the
  store
- queue actions still require explicit authenticated owner/system authority
- the bridge never imports internal store writers or canon mutation primitives
- runtime projections, session packs, retrieval results, wiki pages, and
  summaries remain derived surfaces rather than truth sources

The first release target is a local trusted-collaborator installation, not a
hostile multi-tenant service.

---

## 5. Master Plan

### Step 1. Operational Foundation

Make the repo cleanly buildable, typecheckable, testable, and smoke-testable
from a fresh clone before adding installer complexity.

Primary outcome:

- a reliable developer and CI baseline for the runtime bridge work

### Step 2. Cristalina CLI And Runtime Bridge Package

Create the installable command surface and runtime-neutral bridge layer.

Primary outcome:

- a `cristalina` command can initialize, configure, inspect, and run bridge
  flows without exposing internal memory-law primitives

### Step 3. Configuration Menu

Create an interactive configuration flow in the style of `openclaw config`.

Primary outcome:

- a human can configure Cristalina once and then let the runtime bridge operate
  from validated config

### Step 4. Runtime-Neutral Event Bridge

Translate runtime events into the existing adapter APIs through one shared
contract.

Primary outcome:

- OpenClaw and Hermes event adapters call the same bridge semantics instead of
  creating two memory models

### Step 5. OpenClaw Installer

Create the one-line OpenClaw installation path.

Primary outcome:

- OpenClaw can discover and use Cristalina with minimal manual setup

### Step 6. Hermes Installer

Create the one-line Hermes installation path.

Primary outcome:

- Hermes can discover and use Cristalina with the same memory law as OpenClaw

### Step 7. Session Continuity

Expose checkpoint, session pack, and resume receipt behavior through adapter
and bridge surfaces.

Primary outcome:

- sessions can hand off or resume across OpenClaw and Hermes without turning
  derived packs into authority

### Step 8. Seamless Operation

Add operator diagnostics, recovery commands, projection refresh behavior, and
runtime-facing summaries.

Primary outcome:

- after installation, normal operation does not require manual store inspection

---

## 6. Step 1 Plan: Operational Foundation

**Execution status:** implemented as the first operational foundation slice.

### Purpose

Before adding a CLI or installer, the repo must behave like an installable
project. A one-line installer cannot depend on hidden local build state.

### Problems To Solve

- `pnpm -r typecheck` can fail from a clean state when adapter typecheck starts
  before `packages/core/dist` exists
- adapter tests import core test helpers from `../../core/dist/...`
- package scripts do not encode the build dependency needed by adapter
  typecheck
- there is no dual-runtime smoke command proving both adapters against one
  store
- README and project status do not fully match the executable baseline

### Contracts To Define

- workspace typecheck contract:
  - running `pnpm -r typecheck` from a clean clone must not require a prior
    manual build
  - adapters must either typecheck against source through TypeScript project
    references or build the core before adapter typecheck
- smoke fixture contract:
  - one command creates or resets a local smoke store
  - OpenClaw writes one governed preference or review-producing signal
  - Hermes writes one governed preference or diagnostic signal
  - both projections are loaded from the same store
  - at least one queue listing or queue action is exercised through an adapter
- docs contract:
  - README, `PROJECT-STATUS.md`, and this roadmap must agree on what exists and
    what remains

### Implementation Units

1. Fix workspace build/typecheck ordering.
2. Decide whether adapter tests should import core source, package exports, or
   built dist test helpers.
3. Add a root script such as `smoke:dual-runtime`.
4. Add a dual-runtime smoke fixture under a clear examples path.
5. Update README/status to stop describing implemented retrieval/session pieces
   as future work.
6. Add a short operator-facing smoke README.

### Tests And Verification

- `pnpm -r typecheck` from a clean state with no `packages/core/dist`
- `pnpm -r test`
- `pnpm smoke:dual-runtime`
- smoke output proves:
  - same store root
  - OpenClaw projection exists
  - Hermes projection exists
  - runtime/session/thread refs are stable
  - audit and validation logs were written

### Exit Criteria

- no hidden dependency on stale `dist`
- one command proves the first dual-runtime loop
- docs describe the current baseline accurately
- no adapter imports `packages/core/src/internal.ts` or internal package paths

### Implemented Slice

- adapter build, typecheck, and test scripts now run behind a serialized
  core-dist wrapper so recursive workspace commands do not depend on stale
  `packages/core/dist`
- root `pnpm smoke:dual-runtime` builds the needed packages and runs a
  dual-runtime store smoke
- `examples/dual-runtime-smoke/README.md` documents the generated smoke store
- README and project status now include the dual-runtime smoke and current
  retrieval/session baseline

The smoke flow intentionally writes OpenClaw and Hermes preferences into
distinct semantic slots for the same owner. That keeps the smoke focused on
runtime wiring and queue behavior instead of exercising contradiction
resolution.

### Explicit Non-Goals

- no installer yet
- no interactive menu yet
- no runtime daemon yet
- no broader memory operation vocabulary

---

## 7. Step 2 Plan: Cristalina CLI And Runtime Bridge Package

**Execution status:** implemented as the first CLI and runtime-bridge boundary.

### Purpose

Create the command and package boundary that installers and runtimes will use.
The CLI should be thin, operational, and contract-driven.

### Package Shape

Preferred package:

- `packages/cli`
- package name: `@cristalina-v4/cli`
- binary: `cristalina`

Candidate commands:

- `cristalina init`
- `cristalina config`
- `cristalina doctor`
- `cristalina status`
- `cristalina smoke dual-runtime`
- `cristalina bridge start`
- `cristalina projection list`
- `cristalina projection refresh`
- `cristalina reviews list`
- `cristalina reviews apply`
- `cristalina install openclaw`
- `cristalina install hermes`

### Contracts To Define

- CLI commands may call public core and adapter package APIs only
- CLI may not import raw persistence, governance engine, canon engine, or
  workflow internals through the internal entrypoint
- CLI config must be validated before any write-through operation
- CLI must distinguish:
  - operator identity
  - authenticated principal
  - evidence speaker
  - owner identity
  - agent identity
  - runtime instance
  - runtime session
  - conversation thread
- CLI output must summarize refs and statuses without pretending projections are
  truth

### Implementation Units

1. Add package scaffold and binary.
2. Add argument parser and command router.
3. Add config loader and resolver hooks, initially read-only.
4. Add `doctor` checks for store root, package versions, config validity, and
   projection availability.
5. Add `status` summary for store, adapters, latest projections, diagnostics,
   and pending review counts.
6. Add smoke command that wraps the Step 1 dual-runtime fixture.

### Tests And Verification

- CLI command parser tests
- config loading tests
- `doctor` tests against:
  - missing config
  - invalid store root
  - missing runtime binding
  - valid dual-runtime smoke store
- public API boundary test proving CLI does not import internal package paths

### Exit Criteria

- `pnpm cristalina --help` or equivalent local script works
- `cristalina doctor` can run without writing memory
- `cristalina smoke dual-runtime` proves the existing adapter loop

### Implemented Slice

- `packages/cli` defines `@cristalina-v4/cli` and binary `cristalina`
- root `pnpm cristalina --help` builds the required public packages and runs
  the local command
- command parser covers the planned command surface for init, config, doctor,
  status, smoke, bridge, projection, reviews, and install
- config loader preserves operator, authenticated principal, owner, agent,
  runtime instance, session, and thread distinctions
- bridge/status code imports only public core and adapter packages
- `cristalina smoke dual-runtime` wraps the Step 1 smoke fixture
- tests cover parser behavior, config loading, doctor behavior, init behavior,
  and public-boundary import discipline

### Explicit Non-Goals

- no runtime-specific installer script yet
- no long-running daemon yet
- no hidden auto-ratification of owner-scoped claims

---

## 8. Step 3 Plan: Configuration Menu

### Purpose

Make Cristalina configurable without forcing the operator to hand-edit JSON or
understand the whole store layout.

### Configuration Domains

The menu must cover:

- store root
- owner identity
- agent identity
- authenticated principal defaults
- OpenClaw runtime instance
- Hermes runtime instance
- session and thread strategy
- projection consistency preference
- review behavior
- checkpoint and resume behavior
- diagnostics verbosity
- installer/runtime hook locations

### Config Artifacts

Candidate local files:

- user config: `~/.cristalina-v4/config.json`
- project config: `.cristalina-v4/config.json`
- runtime install metadata:
  - `.cristalina-v4/runtime-openclaw.json`
  - `.cristalina-v4/runtime-hermes.json`

Final placement must be decided before implementation and covered by schema.

### Contracts To Define

- config is operational state, not canon
- config can name owner/agent/runtime refs, but it does not prove authority by
  itself
- authenticated principal defaults must be explicit and inspectable
- config schema version must be persisted
- migration strategy must exist before changing config shape
- secrets, if introduced later, must not be written into shareable store
  records

### Menu Flow

1. Select or create store root.
2. Select owner identity ref or create initial owner identity candidate through
   legal setup flow.
3. Select agent identity ref.
4. Configure OpenClaw runtime identity.
5. Configure Hermes runtime identity.
6. Choose session/thread strategy:
   - reuse current session
   - new session per runtime launch
   - prompt per launch
7. Choose projection consistency mode:
   - allow mixed-state runtime bootstrap
   - require checkpoint-consistent resume where available
8. Choose review behavior:
   - list only
   - prompt in CLI
   - expose to runtime projection
9. Run `doctor` after saving.

### Tests And Verification

- schema validation for config
- menu can run in non-interactive test mode
- invalid refs produce actionable diagnostics
- saved config can be loaded by `doctor`, `status`, and smoke commands

### Exit Criteria

- `cristalina config` can create a valid config from scratch
- config can be edited later without breaking existing store records
- missing required values are diagnosed before runtime writes begin

### Explicit Non-Goals

- no hosted account system
- no participant secrecy model beyond current product assumptions
- no secrets manager until a runtime actually requires secrets

---

## 9. Step 4 Plan: Runtime-Neutral Event Bridge

### Purpose

Create one bridge contract that both runtime-specific integrations use. The
bridge translates runtime events into adapter calls; it does not define memory
law.

### Event Contract

Initial event families:

- `message_observed`
- `conversation_preference_signal`
- `projection_feedback`
- `runtime_diagnostic`
- `review_action_requested`
- `checkpoint_requested`
- `projection_refresh_requested`
- `session_resume_requested`

### Bridge Responsibilities

- load validated config
- resolve runtime context
- derive deterministic ids
- validate authenticated principal
- call the correct adapter function
- load or refresh projection after writes when configured
- summarize pending reviews and diagnostics
- emit bounded diagnostic-only intake when runtime refs drift

### What The Bridge Must Not Do

- write canon directly
- write raw records directly
- call internal core entrypoints
- infer owner authority from `speaker_ref`
- generate proposals from projection markdown, wiki prose, or session-pack prose
- silently repair runtime identity drift

### Implementation Units

1. Define bridge event TypeScript types.
2. Define deterministic id strategy.
3. Implement event normalization.
4. Implement OpenClaw bridge adapter.
5. Implement Hermes bridge adapter.
6. Implement shared projection refresh behavior.
7. Implement bridge diagnostics.
8. Add bridge smoke tests.

### Tests And Verification

- event normalization tests
- idempotent repeated event delivery
- duplicate event replay does not create semantically new records
- runtime drift goes to diagnostic-only intake
- participant-originated owner claim routes to review
- owner-authenticated claim can ratify only through legal path

### Exit Criteria

- both OpenClaw and Hermes can call the same bridge semantics
- bridge output includes projection summary and review summary
- adapter parity is proven by tests against the same store

### Explicit Non-Goals

- no LLM extraction pipeline
- no arbitrary memory editing
- no runtime-specific semantic fork

---

## 10. Step 5 Plan: OpenClaw Installer

### Purpose

Make Cristalina installable into OpenClaw with one command while keeping
Cristalina's authority and projection boundaries intact.

### Installer Target

Target command:

```bash
curl -fsSL https://.../install-openclaw.sh | sh
```

Local development equivalent:

```bash
cristalina install openclaw
```

### Installer Responsibilities

- check Node and package manager requirements
- install or locate the Cristalina CLI
- detect OpenClaw installation/config location when possible
- register Cristalina bridge hook or command entry
- run `cristalina config` when required values are missing
- run `cristalina doctor --runtime openclaw`
- write install metadata outside canon/world/wiki truth layers
- provide an uninstall or disable path

### OpenClaw Runtime Contract

OpenClaw integration must support:

- sending message/preference/diagnostic events to the bridge
- loading latest compatible OpenClaw bootstrap projection
- seeing pending review summaries
- sending explicit review actions with authenticated principal
- reporting runtime ref drift as diagnostic-only intake

### Tests And Verification

- installer dry-run test
- config detection test
- idempotent reinstall test
- uninstall/disable test
- OpenClaw smoke event writes to same store as CLI smoke
- OpenClaw projection loads after write

### Exit Criteria

- one local command installs the OpenClaw integration
- rerunning the installer does not duplicate runtime identity or hooks
- `cristalina doctor --runtime openclaw` passes after install

### Explicit Non-Goals

- no broad OpenClaw UI redesign
- no adapter-side canon mutation
- no bypass of review queues for convenience

---

## 11. Step 6 Plan: Hermes Installer

### Purpose

Make Cristalina installable into Hermes with one command and prove that Hermes
uses the same core memory law as OpenClaw.

### Installer Target

Target command:

```bash
curl -fsSL https://.../install-hermes.sh | sh
```

Local development equivalent:

```bash
cristalina install hermes
```

### Installer Responsibilities

- check Node and package manager requirements
- install or locate the Cristalina CLI
- detect Hermes installation/config location when possible
- register Cristalina bridge hook or command entry
- run `cristalina config` when required values are missing
- run `cristalina doctor --runtime hermes`
- write install metadata outside canon/world/wiki truth layers
- provide an uninstall or disable path

### Hermes Runtime Contract

Hermes integration must support:

- sending message/preference/diagnostic events to the bridge
- loading latest compatible Hermes bootstrap projection
- seeing pending review summaries
- sending explicit review actions with authenticated principal
- reporting runtime ref drift as diagnostic-only intake

### Tests And Verification

- installer dry-run test
- config detection test
- idempotent reinstall test
- uninstall/disable test
- Hermes smoke event writes to same store as CLI smoke
- Hermes projection loads after write
- parity test comparing equivalent OpenClaw and Hermes bridge flows

### Exit Criteria

- one local command installs the Hermes integration
- rerunning the installer does not duplicate runtime identity or hooks
- `cristalina doctor --runtime hermes` passes after install
- Hermes does not require a separate memory-law branch

### Explicit Non-Goals

- no Hermes-specific governance semantics
- no runtime-authored canonical memory
- no hidden proposal extraction from session summaries

---

## 12. Step 7 Plan: Session Continuity

### Purpose

Connect the existing checkpoint, session-pack, and resume-receipt primitives to
real OpenClaw and Hermes runtime behavior.

### Current State

The core can represent working-memory checkpoints, compile session packs, and
record resume receipts. Runtime projection loaders currently focus on bootstrap
runtime projections. The missing product behavior is adapter-facing session
resume.

### Contracts To Define

- checkpoint write request contract
- latest valid checkpoint selection contract
- session-pack projection loading contract
- consumed receipt contract
- applied receipt contract
- cross-runtime handoff contract
- invalidation contract for stale epoch, stale generation, or unresolved
  upstream refs

### Implementation Units

1. Add public helper for writing or materializing working-memory checkpoints if
   the existing storage-only support is insufficient.
2. Add session-pack listing/loading APIs alongside bootstrap projection loading.
3. Add adapter exports for session-pack consumption.
4. Add CLI commands:
   - `cristalina checkpoint create`
   - `cristalina session-pack compile`
   - `cristalina session-pack latest`
   - `cristalina session-pack consume`
   - `cristalina session-pack apply`
5. Add bridge events for pause, compact, resume, and handoff.
6. Add cross-runtime handoff fixtures:
   - OpenClaw to Hermes
   - Hermes to OpenClaw

### Tests And Verification

- checkpoint supersession
- epoch invalidation
- missing upstream ref rejection
- consumed receipt idempotence
- applied receipt idempotence
- projection markdown is not eligible proposal input
- session pack cannot be loaded through bootstrap-only APIs by accident

### Exit Criteria

- a runtime can resume from derived context while upstream refs remain the
  authority
- both adapters expose session continuity without semantic fork
- cross-runtime handoff is executable in a fixture

### Explicit Non-Goals

- no summary-to-proposal shortcut
- no derived-to-canon transition
- no mutable handoff packet

---

## 13. Step 8 Plan: Seamless Operation

### Purpose

Make day-to-day Cristalina usage predictable after installation. The operator
should not need to inspect store internals unless debugging a serious issue.

### Operator Surfaces

Required CLI surfaces:

- `cristalina doctor`
- `cristalina status`
- `cristalina projection list`
- `cristalina projection show`
- `cristalina projection refresh`
- `cristalina reviews list`
- `cristalina reviews apply`
- `cristalina diagnostics list`
- `cristalina store inspect`
- `cristalina recover`

### Runtime-Facing Surfaces

Required runtime summaries:

- latest projection status
- pending review count
- diagnostic count
- last write status
- last projection refresh status
- session continuity status
- actionable config errors

### Recovery And Diagnostics

The operational layer must detect:

- missing config
- missing store manifest
- invalid store path
- projection context ambiguity
- no compatible projection
- stale projection compiler version
- stale read-policy version
- runtime ref drift
- pending owner review
- pending manual contradiction review
- recovery journal present
- invalid session pack

### Tests And Verification

- `doctor` fixture matrix
- runtime-facing diagnostic summaries
- projection refresh idempotence
- review list/apply flows through adapter boundary
- recovery command does not mutate canon except through legal queued actions

### Exit Criteria

- a normal installed user can understand what Cristalina is doing from commands
  and runtime summaries
- repair/recovery actions remain explicit
- no operational convenience path bypasses authority, provenance, or projection
  rules

### Explicit Non-Goals

- no polished graphical UI
- no hosted synchronization service
- no external hostile multi-tenant hardening as the primary design center

---

## 14. Execution Rule

Planning and execution must stay separate.

For each master-plan step:

1. update or confirm the detailed step plan
2. define contracts and test cases
3. implement only that step's scoped work
4. verify with targeted tests and the relevant smoke command
5. update docs/status before moving to the next step

The next implementation step, after this roadmap is accepted, is:

**Step 1. Operational Foundation.**

---

## 15. Deferred On Purpose

Still intentionally deferred:

- rich adapter-specific UI
- broad autonomous memory editing
- arbitrary external-user access
- hostile multi-tenant hardening as the primary design center
- embeddings-first product behavior
- treating session packs, wiki pages, retrieval results, projections, or
  summaries as direct truth sources
- runtime-specific memory semantics

These are deferred because the shortest path to value is now an installable
local runtime bridge over the existing core.
