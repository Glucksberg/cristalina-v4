# Cristalina v4
## Hermes Live Test Roadmap

**Status:** Active Test Plan  
**Updated:** 2026-05-16  
**Scope:** Next live-test phase for the native Hermes provider and nightly
memory cycle.

---

## 1. Purpose

This roadmap turns the current Hermes/Cristalina experiment into a concrete
test sequence. The goal is not to add a new memory model. The goal is to prove
which parts of the existing governed-memory kernel are active, which parts need
stronger product surfaces, and which dormant areas should be activated by
realistic agent life.

Cristalina should be judged as a memory system over lived and observed facts:

```text
Hermes interaction or job
-> runtime evidence
-> nightly consolidation
-> semantic maturation through Hermes' model harness
-> world/wiki/proposal/canon/review
-> provider recognition and hydration back into Hermes
```

Farol remains an external read-only observer for this test phase. It may detect
stalls, drift, diagnostics, missed runs, weak projections, and operator-facing
confusion, but it must not become part of Cristalina's product memory loop.

---

## 2. Test Principles

- Test the native Hermes provider first; keep bridge behavior as compatibility
  or fallback evidence ingress.
- Prefer long-running observation over forced one-off success.
- Separate research collection quality from Cristalina memory quality. Better
  X/Twitter queries can improve the evidence diet, but they must not become a
  hidden substitute for maturation, governance, or projection behavior.
- Do not treat `message_observed` as truth. It is runtime evidence until
  consolidation and maturation route it.
- Owner-scoped claims should surface as review questions unless the owner has
  already provided explicit authority.
- Low-risk, non-owner claims may reach canon autonomously only through
  proposal, ratification, and canon records.
- Do not evaluate success only by canon count. Also evaluate support refs,
  skipped refs, wiki quality, pending reviews, diagnostics, recognition entries,
  and whether Cristal's later behavior reflects projected memory.

---

## 3. Phase A: Soak The Nightly Cycle

**Question:** Does the nightly cycle reliably turn accumulated evidence into
governed memory without manual intervention?

Run for at least three stable days while Cristal continues normal Telegram,
heartbeat, and AI-pulse activity.

Expected evidence:

- `cristalina-nightly-memory-cycle` runs daily at 03:00 with `last_status=ok`
- each run writes an evidence package and `llm-output.json`
- selected observation refs move forward instead of repeatedly reprocessing the
  same batch
- `skipped_already_matured_observation_refs` grows as backlog is covered
- diagnostics do not grow from invalid events or malformed LLM output

Primary checks:

```bash
node scripts/monitor-cristal-hermes.mjs
hermes cron list
cristalina memory candidates --runtime hermes --config <config>
cristalina memory promote-candidates --runtime hermes --config <config>
```

Pass signal:

- nightly cycle is stable for three consecutive days
- canon/wiki/proposal counts move when evidence supports it
- `memory promote-candidates` reports no stuck auto-ready slot that should have
  been promoted

---

## 4. Phase B: Owner-Review Loop

**Question:** Can Cristalina identify owner-scoped memory and ask for explicit
direction without blocking unrelated non-owner learning?

Create natural conversations where Markus states preferences, project goals,
security principles, and product decisions. Some should be direct, some should
be ambiguous.

Expected behavior:

- clear owner-scoped claims become owner-review questions or are ratified only
  when explicit authority is present
- unrelated research claims continue toward wiki/proposal/canon
- review questions include semantic slots, support counts, and enough context
  for a human decision

Pass signal:

- Farol and `memory candidates` show review questions with actionable wording
- accepted/rejected owner decisions can be applied through the governed queue
  rather than by editing store internals

Current known review candidates:

- `agent_security_physical_side_channels_rf_principle`
- `cristalina_beam_governed_memory_benchmark_plan`
- `owner_preferences.cristalina.memory_improvement_review_process`

---

## 5. Phase C: Projection And Behavior Feedback

**Question:** Does memory that reached wiki/canon/projection change what Cristal
recognizes and uses in later turns?

Use prompts that should benefit from existing memory without restating the full
history. Examples:

- ask Cristal to summarize what public agent-memory research has been teaching
  her lately
- ask why context window is not the same thing as durable memory
- ask what patterns she has seen around decay, pruning, lifecycle, and
  retrieval quality
- ask what unresolved owner-review questions exist

Expected behavior:

- provider recognition entries include relevant canon/wiki context
- Cristal can cite the remembered pattern at the right abstraction level
- stale or low-confidence evidence does not appear as hard truth

Pass signal:

- answers reflect projected memory without the user re-feeding the evidence
- Farol shows recognition/projection health and no provider prefetch failures

---

## 6. Phase D: Contradiction And Supersession

**Question:** Can Cristalina distinguish new conflicting evidence from ordinary
additional support?

Introduce controlled contradictions through normal conversation or articles:

- a claim that memory should be mostly append-only versus a claim that memory
  needs pruning and forgetting
- a claim that context windows replace memory versus a claim that context
  windows are not memory
- a changed owner preference stated clearly as a replacement for an old one

Expected behavior:

- external research disagreement should become disputed evidence, wiki nuance,
  or contradiction candidates
- owner preference changes should not silently overwrite prior owner memory
- contradiction/resolution records should appear only when the core contract is
  actually satisfied

Pass signal:

- world contradiction or review surfaces become active without corrupting canon
- projections suppress stale or unresolved claims when appropriate

---

## 7. Phase E: Wiki Quality And Knowledge Shape

**Question:** Is the wiki becoming a useful synthesis layer, or only a pile of
thin slot pages?

Inspect wiki pages for recurring themes:

- retrieval quality and ranking
- lifecycle, decay, pruning, compression, and forgetting
- layered memory architectures
- governance, provenance, authority, security, poisoning, and auditability
- portability and user-controlled memory

Expected behavior:

- pages are evidence-backed and source-neutral
- pages preserve support refs
- pages synthesize related observations instead of copying heartbeat text
- wiki does not pretend to be canon

Pass signal:

- Cristal can use wiki pages as orientation
- proposal/canon candidates still dereference eligible upstream evidence rather
  than wiki prose alone

---

## 8. Phase F: Broader Life Tests

**Question:** What additional regions of the memory kernel activate when Cristal
has a more varied life?

Introduce gradually:

- normal daily chat with Markus about preferences, goals, plans, and beliefs
- article reviews with competing viewpoints
- troubleshooting sessions with concrete outcomes
- one small group-chat test after owner-review behavior is reliable
- later, semantic/vector retrieval tests after wiki/canon quality is healthy

Expected activation:

- preferences, goals, values, and constraints
- episodes and troubleshooting procedures
- contradictions and supersessions
- session continuity and projected recognition
- eventually retrieval/vector evals

Do not start with group chat or vector retrieval as the proof of memory. Those
are useful stress tests only after the current loop is reliable.

---

## 9. Watch List

- Missed 03:00 runs after Windows/WSL restarts.
- Auth drift in Hermes provider/OAuth causing cron failures.
- Auto-ready candidates stuck after promotion.
- Owner-review questions accumulating without a product surface.
- Wiki growth that is too thin to guide behavior.
- Canon becoming too conservative or too eager.
- Repeated X/Twitter topics crowding out normal lived interaction evidence.
- Provider recognition entries growing while Cristal's visible behavior does not
  reflect memory.

---

## 10. Current Baseline As Of 2026-05-16

The live test has already activated the main spine:

- native Hermes provider enabled
- provider prefetch enabled
- nightly memory cycle installed and running
- consolidation, maturation, and candidate promotion active
- runtime observations, dispositions, world claims, wiki pages, proposals,
  ratifications, canon records, and Hermes projections are all present

The current store is no longer only ingestion. It is producing governed memory.

Observed counts from the 2026-05-16 Farol snapshot:

- runtime observations: 434
- proposals: 40
- wiki pages: 39
- canon records: 29
- recognition entries: 221
- research heartbeat count: 292
- owner-review questions: 3

The next test risk is not whether the pipeline exists. It is whether the memory
that reaches wiki/canon/projection reliably changes future behavior and whether
owner-review and contradiction flows become usable without manual store edits.
