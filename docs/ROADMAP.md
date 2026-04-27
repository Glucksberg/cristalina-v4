# Cristalina v4
## Roadmap

**Status:** Active Draft  
**Updated:** 2026-04-27  
**Current posture:** executable core with thin Hermes and OpenClaw boundaries

---

## 1. Roadmap Principle

Cristalina v4 has moved past the "architecture only" stage.

The core now has enough executable law to stop treating adapters as a distant
future phase. The next useful milestone is not broader architecture; it is a
small live-session bridge that proves the existing kernel can sit under one
Hermes session and one OpenClaw session without either runtime defining memory
semantics.

The build order still remains:

`docs -> types -> schemas -> fixtures -> kernel code -> adapters`

But the immediate pressure should now come from real runtime loops, not from
more speculative kernel expansion.

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

This means the first real integration does not need a new memory model.

---

## 3. How Far From A Real Hermes/OpenClaw Session

### Ready enough for a controlled first wiring

The repository is ready to connect a controlled Hermes session and a controlled
OpenClaw session if the first wiring accepts the current thin contract:

- the runtime can send authenticated write-through calls into the adapter
- the runtime can provide stable runtime/session/thread refs
- the runtime can load a compiled runtime projection by manifest id or latest
  compatible context
- humans or trusted system principals handle owner/manual-review queue actions
  through the explicit adapter APIs
- the first session focuses on preference, runtime observation, diagnostics,
  and review flows rather than arbitrary memory editing

### Not ready yet for a polished product loop

Still missing before the system feels like a normal always-on product:

- a small runtime bridge/daemon or CLI that translates real Hermes/OpenClaw
  session events into adapter calls
- concrete session configuration examples for both runtimes
- a stable operator workflow for selecting root store, actor principal, owner
  identity, runtime instance, session id, and thread id
- a simple projection refresh policy after each write or queue action
- runtime-facing UX around pending reviews and diagnostics
- a smoke fixture that runs one Hermes-style session and one OpenClaw-style
  session against the same store
- operational docs for starting, inspecting, and recovering the store

So the honest answer is:

**the kernel is close enough to wire; the runtime bridge and operator ergonomics
are the main remaining work.**

---

## 4. Immediate Milestone: First Live Runtime Loop

Goal:

- connect one Hermes session and one OpenClaw session to the same Cristalina
  store through the existing adapter APIs

Scope:

- no new canon mutation shortcuts
- no adapter-defined memory law
- no broad UX layer
- no new proposal vocabulary unless the first wiring proves it is required

Minimum flow:

1. initialize or select a `.cristalina-v4` store
2. register or reuse owner, agent, runtime instance, runtime session, and
   conversation thread refs
3. write a conversation-preference signal from OpenClaw through the OpenClaw
   adapter
4. write a conversation-preference or runtime diagnostic signal from Hermes
   through the Hermes adapter
5. load latest runtime projection for each runtime context
6. list pending owner/manual-review queues
7. apply one queue action through the adapter boundary
8. reload both projections and confirm canon/world/wiki/review state is visible
   without collapsing provenance or authority

Definition of done:

- one command or small script can run the dual-runtime smoke flow
- OpenClaw and Hermes projections come from the same store
- both adapters use the public package entrypoint only
- no adapter imports raw store writers, governance engine, or canon apply
  primitives
- projection manifests identify adapter, runtime/session/thread context,
  read-policy version, compiler version, included refs, and suppressed refs
- audit and validation logs explain the writes and queue actions

---

## 5. Phase Plan From Here

### Phase A. Runtime Bridge Slice

Purpose:

- turn the current adapter APIs into a first usable live-session bridge

Work:

- add a minimal bridge module or script for Hermes session events
- add a minimal bridge module or script for OpenClaw session events
- define runtime config inputs: store root, actor, authenticated principal,
  owner identity, runtime instance, session, thread, and projection selection
- add a shared smoke fixture for one Hermes session plus one OpenClaw session
- document the first manual operator loop

Exit criteria:

- a developer can run a single smoke command and inspect the resulting store
  plus both runtime projections

### Phase B. Operator UX And Diagnostics

Purpose:

- make the thin bridge usable without reading store internals every time

Work:

- expose concise pending-review summaries
- expose drift and projection diagnostics clearly
- add projection refresh commands
- add store inspection commands for recent writes, current canon, active world
  claims, pending reviews, and diagnostics
- document recovery behavior

Exit criteria:

- a trusted operator can see what the system wants, what it wrote, what it
  deferred, and why

### Phase C. Live Session Continuity

Purpose:

- connect the existing checkpoint/session-pack/receipt primitives to actual
  Hermes and OpenClaw session handoff behavior

Work:

- add adapter-facing helpers for checkpoint emission
- compile session packs for each runtime context
- record resume receipts after a runtime consumes a pack
- add cross-runtime handoff fixture from Hermes to OpenClaw and OpenClaw to
  Hermes

Exit criteria:

- a session can resume from derived context without treating the derived pack
  as truth or bypassing upstream refs

### Phase D. Broader Memory Roads

Purpose:

- widen beyond the current preference trunk only after the live loop works

Work:

- add more proposal operations only where a live flow proves the need
- strengthen procedure/constraint/goal/value flows
- add more wiki-to-governance candidate fixtures
- expand retrieval-backed projection contexts
- add longitudinal evals across days and sessions

Exit criteria:

- broader memory types use the same governance, replay, projection, and
  authority law as the initial preference/session loop

---

## 6. Deferred On Purpose

Still intentionally deferred:

- rich adapter-specific UI
- broad autonomous memory editing
- hostile multi-tenant hardening as the primary design center
- arbitrary external-user access
- embeddings-first product behavior
- treating session packs, wiki pages, retrieval results, or projections as
  direct truth sources

These are deferred because the shortest path to value is now a thin live loop
over the core, not a wider surface area.

---

## 7. Practical Estimate

In roadmap terms, the project is no longer "far from adapters."

What remains before a first real Hermes/OpenClaw connection is mostly:

- bridge glue
- runtime configuration
- smoke fixtures
- operator docs
- a small amount of projection refresh ergonomics

The risky architectural work is much smaller than it was. The remaining risk is
integration discipline: preserving authenticated authority, stable runtime
identity, replayability, and projection boundaries while making the first live
loop convenient enough to use.
