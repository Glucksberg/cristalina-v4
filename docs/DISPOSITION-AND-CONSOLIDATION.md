# Cristalina v4
## Disposition and Consolidation

**Status:** Active Draft  
**Purpose:** Freeze how new information is routed before or instead of canonical promotion.

---

## 1. Why This Document Exists

The current Cristalina lineage is already strong once information becomes a proposal.

Cristalina v4 needs to be equally clear about the step before that:

- what happened to the input at all

Without that, the architecture risks becoming proposal-centric in a way that hides all the non-canonical fates information may legitimately take.

---

## 2. Disposition Thesis

Every intake should terminate in an explicit disposition.

That disposition explains what the system did with the input now, even if the final durable truth is not decided yet.

The minimum outcomes should be:

- `evidence_only`
- `runtime_only`
- `world_update`
- `wiki_update`
- `proposal_for_canon`
- `queued_review`
- `diagnostic_only`

Some inputs may legitimately produce more than one outcome.

---

## 3. Why This Matters

This model prevents several failures:

- weak observations being mistaken for canonical candidates by default
- wiki updates being invisible because they are "not canon"
- world updates being under-described
- diagnostics being treated as implementation noise instead of architecture

It also gives the runtime a clearer feedback story:

- what was retained
- what was ignored
- what was queued
- what still needs review

---

## 4. Disposition Record

The architecture should introduce a first-class `DispositionRecord`.

Its job is to preserve:

- which inputs were evaluated
- which outcomes were assigned
- which target layers were updated
- which proposal refs were emitted
- which diagnostics were emitted
- why those outcomes were chosen

This should live under governance or audits, not inside one adapter.

### Executable invariants

The executable baseline should now enforce at least:

- `proposal_for_canon` requires `proposal_refs`
- `diagnostic_only` requires `diagnostic_refs`
- each outcome must map to its legal target layer
- disposition arrays should stay deduplicated so routing remains inspectable

---

## 5. Routing Matrix

| Input quality | Typical disposition |
|---|---|
| weak, noisy, or unverifiable | `evidence_only` or `diagnostic_only` |
| useful for immediate behavior only | `runtime_only` |
| structurally useful but not canonical yet | `world_update` |
| editorially useful summary or synthesis | `wiki_update` |
| durable governed candidate | `proposal_for_canon` |
| needs human or policy review | `queued_review` |

This is not a scoring system by itself.

It is the named result of earlier evaluation.

---

## 6. Relationship to Governance Gates

Disposition is not the same thing as governance gating.

### Governance gate

Answers:

- may this candidate move into canon

### Disposition

Answers:

- what happened to this input overall

That distinction should remain explicit.

---

## 7. MVP Rule

Every MVP flow should be able to say:

1. which observation was created
2. which world or wiki updates happened
3. whether a proposal was emitted
4. what the disposition record says

If an MVP flow cannot say that, it is still underspecified.
