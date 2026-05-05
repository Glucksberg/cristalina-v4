# Cristalina v4 Agent Instructions

This repository is in the live Hermes/Cristalina test phase. The purpose of
this workspace is to help Markus observe, explain, and improve Cristalina while
the Hermes agent Cristal uses it as memory.

## Current Product State

Cristalina is no longer being treated as a bridge-only experiment. Hermes now
uses the native `cristalina` memory provider as the main live-test surface.
The old bridge path remains useful as an operational fallback and compatibility
boundary, but new work should assume the provider path is the product direction.

Cristalina owns:

- runtime evidence intake and provenance
- recognition, hydration, archive descent, and projection behavior
- diagnostics, review queues, and authority legality
- governed movement from evidence toward wiki, canon, world, or proposals
- nightly memory consolidation as conservative evidence classification

Hermes owns:

- the running agent process and user interaction
- native memory provider calls into Cristalina
- runtime event emission for observed turns and background work
- cron/heartbeat execution that produces evidence for Cristalina

Farol owns:

- external observation of the live test
- detection of broken flows, congestion, diagnostics, stuck reviews, and drift
- operator-facing interpretation of what Cristalina actually recorded

Do not blur those roles. Cristalina memory must be evaluated on its own
behavior, not propped up by hidden instructions to Cristal or by Farol writing
memory for it.

## Farol

The external monitor is called Farol:

```bash
node scripts/monitor-cristal-hermes.mjs
node scripts/monitor-cristal-hermes.mjs --watch --interval-ms 10000
```

Default monitor output lives under:

```text
.cristalina-v4/test-monitor/
```

Use Farol before and after live-test analysis or meaningful code changes. It is
read-only. It can inspect Hermes provider configuration, emitted events,
per-event processing logs, Cristalina status, diagnostics, projections, review
queues, store shape, recognition state, and memory consolidation counts.

Farol should stay mostly invisible to Cristal. Intervene in Cristal's live
session only when the external view shows a concrete blocker: invalid events,
accumulating diagnostics, stuck processing, broken projections, pending reviews
that need operator attention, misleading assumptions, or a code defect that the
running agent cannot repair from inside the session.

## Live-Test Investigation Loop

For any symptom in the Hermes/Cristalina test:

1. run a one-shot Farol snapshot
2. identify the latest relevant Hermes event or cron artifact
3. inspect the event JSON and matching processing log
4. check Cristalina status, diagnostics, projections, review queues, and store
   counts
5. decide whether the problem belongs to Hermes emission, provider prefetch,
   Cristalina event processing, store state, projection/read behavior, cron
   behavior, or operator expectation
6. patch only the layer that owns the broken contract
7. run focused tests and then a fresh Farol snapshot

Do not guess from chat context when a monitor artifact, durable record, or
command output can answer the question. Prefer concrete paths, record refs,
diagnostics, and reproducible commands.

## Memory Semantics Under Test

`message_observed` is runtime evidence. It proves that something was observed by
a runtime; it does not prove the content is true, stable, owner-ratified, or
ready for wiki/canon/world promotion.

Nightly memory consolidation is also conservative. It may classify accumulated
runtime observations and suggest routes, but it must not promote truth by
itself. If LLM analysis becomes part of consolidation, the first durable result
still enters as evidence unless a governed flow explicitly promotes it.

Keep these processes distinct:

- Cristal's research work can produce evidence and candidate insights
- Cristalina's memory system decides how that evidence is recognized, retrieved,
  consolidated, diagnosed, deferred, or promoted
- Farol observes whether the system is functioning and helps Markus repair
  external or code-level failures

The current test is specifically watching whether Cristalina can mature from
runtime evidence into useful memory structure without hidden Farol steering.

## Authority And Safety

Runtime events are evidence and provenance, not owner authority. `speaker_ref`
explains who produced evidence. Authenticated principals explain who is legally
acting across governance boundaries.

Do not bypass review queues, owner ratification, contradiction handling, or
projection legality to make a test look successful. Pending reviews and
diagnostics are product signals, not annoyances to erase.

Do not repair by editing canon, projections, session packs, resume receipts,
monitor snapshots, or store internals directly. Use runtime events, review
actions, projection refresh, checkpoint/session-pack commands, or code fixes at
the owning layer.

## Engineering Posture

The old early-project rule `docs -> types -> schemas -> fixtures -> kernel code
-> adapters` is no longer the whole operating model. The project now has a live
provider, monitor, runtime store, retrieval surfaces, projections, and cron
loops. Keep contract discipline, but work from the failing or missing behavior
back to the owning layer.

Good changes in this phase usually do one of these:

- make provider behavior more truthful, observable, or non-blocking
- make recognition, hydration, archive descent, or projection more useful
- make runtime evidence easier to consolidate without premature promotion
- make diagnostics and review queues clearer and more actionable
- make Farol better at explaining what happened without becoming a memory writer
- reduce drift between live runtime behavior, CLI commands, docs, and tests

Avoid broad rewrites unless the live evidence points to a real structural
problem. Prefer small executable checks, focused tests, and monitor snapshots
that prove the behavior changed.

## Farol Test Journal

This journal is separate from Cristalina memory. It records operator-visible
progress, fixed problems, lessons, and behaviors to watch during the live test.
It must not be treated as store truth, owner authority, or evidence by
Cristalina.

Keep entries short, dated, and high-signal. Add an entry when the live test
reaches a meaningful milestone, uncovers a repeated behavior, fixes a real
defect, or changes monitoring posture. If details matter, point to commits,
docs, monitor artifacts, or issue notes instead of copying long logs.

Current entries:

- 2026-05-03: Cristal entered the first live Hermes/Cristalina test with Farol
  observing externally instead of steering the agent's normal loop.
- 2026-05-03: The Hermes native memory provider replaced the bridge as the live
  test surface; Farol's healthy baseline is provider configured, native events
  applied, Cristalina status OK, zero diagnostics, and zero pending owner
  reviews.
- 2026-05-03: Cristal's X/Twitter research path uses `bird` in read-only mode
  with credentials loaded from the Hermes home `.env`; account mutation is out
  of scope unless Markus explicitly changes the test.
- 2026-05-03: Test interpretation must distinguish Cristal self-regulation from
  outside repair; Farol intervenes only for blockers, accumulating failures,
  invalid events, stuck reviews, misleading operator assumptions, or code-layer
  defects.
- 2026-05-03: Cristal's first two native Hermes turns were captured and applied
  cleanly; recognition needed a session-scoped runtime-observation read path so
  Farol and provider prefetch could see those observations as live memory.
- 2026-05-05: Nightly memory consolidation replaced the earlier daily review
  naming. The consolidation pass classifies accumulated evidence but still does
  not promote wiki, canon, world truth, or owner authority by itself.
