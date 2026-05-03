# Cristalina v4 Agent Instructions

This repository is now in the first live Hermes/Cristalina observation phase.
Use this workspace as an external observation and intervention layer for Markus,
not as an instruction channel that the Hermes agent depends on.

## Current Operating Mode

Cristalina is being tested with a Hermes agent named Cristal. Hermes emits
runtime evidence through the `cristalina-bridge` plugin; Cristalina owns memory
semantics, projection, diagnostics, review queues, and authority legality.

The monitor is the external observation center for this phase:

```bash
node scripts/monitor-cristal-hermes.mjs
node scripts/monitor-cristal-hermes.mjs --watch --interval-ms 10000
```

Default monitor output lives under:

```text
.cristalina-v4/test-monitor/
```

Use the monitor before and after meaningful changes or live-test analysis. The
monitor observes Hermes bridge events, per-event bridge logs, Cristalina status,
diagnostics, projections, reviews, and store shape. It is read-only and must not
be treated as a memory writer.

Cristal should not be trained to coordinate with this monitor as part of its
normal loop. The test is more valuable when Cristal mostly attempts to
self-regulate through Cristalina itself. The monitor exists to catch accumulated
failures, blocked bridge flow, broken projections, stuck reviews, or code-level
defects that cannot be repaired from inside the running agent.

## External Oversight With Markus

When Markus is testing Cristal, help from this repository by:

- checking the latest monitor snapshot and `snapshots.jsonl`
- inspecting Hermes event JSON and matching `.bridge.log` files when needed
- running Cristalina status, diagnostics, projection, review, and store commands
- explaining what Cristalina actually recorded, deferred, diagnosed, or failed
- proposing focused fixes when the monitor shows a concrete problem

Do not guess from chat context when a monitor artifact can answer the question.
Prefer concrete files, command output, and durable record refs.

Intervene in Cristal's live session only when the outside view shows a real
blocker, accumulating corruption, repeated invalid events, stuck processing, or
a misleading operator assumption. Keep interventions short and factual; avoid
feeding Cristal monitor internals unless those facts are necessary for the next
action.

## Investigation Loop

For any live-test symptom:

1. run a one-shot monitor snapshot
2. identify the latest relevant Hermes event
3. inspect the event contract, bridge log, diagnostics, and pending reviews
4. decide whether the issue is runtime emission, bridge processing, store state,
   projection/read behavior, or operator expectation
5. patch only the layer that owns the broken contract
6. run focused tests and a fresh monitor snapshot

If the monitor shows a bridge failure, inspect the `.bridge.log` before editing
code. If Cristalina reports pending owner review, do not bypass it with runtime
events.

## Development Guardrails

Keep the project moving in this order whenever practical:

```text
docs -> types -> schemas -> fixtures -> kernel code -> adapters
```

Adapters consume core semantics; they do not define memory law. Runtime events
are evidence and provenance, not owner authority. `speaker_ref` explains who
produced evidence; authenticated principals explain who is legally acting across
governance boundaries.

Prefer correctness, recoverability, replayability, auditability, and authority
legality over runtime convenience. Do not repair by editing canon, projections,
session packs, resume receipts, or monitor snapshots directly; use bridge
events, review actions, projection refresh, checkpoint/session-pack commands, or
code fixes at the owning layer.

## Legacy Phrase System

The old session-phrase memory was moved to:

```text
AGENTS-LEGACY-PHRASES.md
```

Do not add new session phrases to `AGENTS.md`. During this phase, summarize
important durable lessons in normal docs, tests, roadmap notes, or explicit
proposals for Markus to approve.
