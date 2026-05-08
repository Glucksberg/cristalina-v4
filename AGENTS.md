# Cristalina v4 Agent Instructions

This repository is in the Hermes native-provider phase. Treat Cristalina as a
governed memory system, not as a bridge demo and not as a self-modifying agent.

## Current Direction

The main product path is the native Hermes `cristalina` memory provider. The
bridge remains an operational fallback and compatibility boundary, but new work
should strengthen the provider, the memory pipeline, and the governed store.

The live memory pipeline is:

```text
message_observed
-> runtime evidence
-> nightly memory consolidation
-> nightly semantic memory maturation
-> world/wiki/proposal/canon/review
-> projections and provider recognition
```

Consolidation classifies accumulated runtime evidence conservatively. Semantic
maturation is the governed LLM-assisted step that may produce structured memory
claims and route them toward world, wiki, canon proposals, review queues,
diagnostics, or evidence-only outcomes.

## Core Invariants

- Runtime events are evidence and provenance, not truth and not owner authority.
- `speaker_ref` describes who produced evidence; authenticated principals
  describe who is legally acting across governance boundaries.
- Owner-scoped claims require owner authority or review when the system cannot
  legally and confidently decide.
- Non-owner technical claims may be promoted autonomously only through the
  governed proposal, ratification, and canon flow.
- Do not edit canon, projections, session packs, resume receipts, monitor
  snapshots, or store internals directly to make a test pass.
- Do not make Cristalina propose changes to its own code as product behavior.
  Code improvement belongs to repository contributors, tests, reviews, and
  commits.

## Development Workflow

Work from observed behavior back to the owning layer. Prefer concrete artifacts:
event JSON, processing logs, diagnostics, record refs, projection outputs, review
queues, and tests.

When investigating the live Hermes/Cristalina setup, Farol is the external
monitor:

```bash
node scripts/monitor-cristal-hermes.mjs
node scripts/monitor-cristal-hermes.mjs --watch --interval-ms 10000
```

Farol is read-only and temporary. Use it to understand live-test failures,
congestion, invalid events, stuck reviews, broken projections, recognition
drift, or operator-facing confusion. Do not turn Farol into a memory writer or a
hidden steering layer for Cristal.

For meaningful code changes:

1. identify the contract or behavior that is failing
2. patch the layer that owns it
3. add focused tests for the failure mode
4. run the relevant package tests
5. keep CLI, docs, installer behavior, and runtime assumptions aligned

Avoid broad rewrites unless live evidence or tests show a structural problem.

## Coding Discipline

Prefer small, contract-driven changes.

- State assumptions when ambiguity affects correctness, authority, runtime
  behavior, or store semantics.
- Push back when a simpler or safer path preserves the contract better than the
  requested implementation.
- Touch only the layer required by the task; do not refactor unrelated code or
  clean up opportunistically.
- Match local style and existing workflow patterns before adding new
  abstractions.
- Turn vague requests into verifiable outcomes: tests, CLI output, monitor
  snapshots, durable records, or diagnostics.
- Keep iterating until the behavior is verified or the blocker is explicit.

## Product Boundaries

Cristalina owns memory semantics: evidence intake, provenance, recognition,
hydration, archive descent, consolidation, maturation, diagnostics, review
queues, authority legality, projections, and governed movement toward durable
memory.

Hermes owns the running agent process, user interaction, provider calls, runtime
event emission, and scheduled jobs that produce evidence for Cristalina.

Farol owns external observation during development only. Its journal lives in
`docs/FAROL-TEST-JOURNAL.md` and must not be treated as Cristalina store truth,
owner authority, or product memory.
