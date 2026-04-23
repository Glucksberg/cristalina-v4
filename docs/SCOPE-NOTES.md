# Cristalina v4
## Scope Notes

**Status:** Active Draft

---

## 1. Purpose

This document records high-signal scope notes that are too important to lose
but not yet stable enough to become binding architecture decisions.

Typical entries here are:

- accepted operational tradeoffs under the current trust model
- policy asymmetries that are deliberate or tolerated for now
- review notes that should shape future hardening or public-surface work

This document is not a backlog and not an ADR log.

- binding architectural choices belong in `docs/DECISIONS.md`
- committed implementation tracks belong in `docs/ROADMAP.md` or
  `docs/HARDENING-PLAN.md`

---

## 2. Active Notes

### SN-2026-04-23-001. Lock domains are independent across subsystems

Current state:

- canonical/workflow writes serialize through
  `audits/snapshots/.store-write.lock`
- wiki maintenance serializes through
  `audits/snapshots/.wiki-maintenance.lock`
- non-canonical intake serializes through per-intake
  `.non-canonical-intake-<stable-id>.lock`

Implication:

- `atomic-write.ts` prevents torn files, but not torn multi-file snapshots
  across those lock domains
- a wiki maintenance cycle or adjacent reader can observe mixed old/new state
  while another subsystem is mid-write

Current posture:

- acceptable under the current trusted-collaborator deployment model
- this is an operational integrity tradeoff, not a snapshot-consistency
  guarantee

Revisit when:

- cross-subsystem snapshot semantics become a product requirement
- wiki maintenance or adapter flows need a unified read point across canon,
  wiki, and non-canonical surfaces
- the deployment model becomes less trusted or more concurrent

Primary references:

- `packages/core/src/workflow-engine/conversation-preference-store.ts`
- `packages/core/src/workflow-engine/wiki-maintenance-store.ts`
- `packages/core/src/workflow-engine/non-canonical-intake-store.ts`

### SN-2026-04-23-002. Session resume receipts still have a test-oriented provenance fallback

Current state:

- `recordSessionResumeReceipt` falls back to the literal
  `"system:session_resume"` when `authenticated_principal` is absent

Implication:

- the receipt remains structurally valid, but the provenance actor is a nominal
  placeholder rather than a stable persisted actor identity

Current posture:

- acceptable while this path is primarily exercised by tests and controlled
  internal flows
- not a good long-term contract for public adapter-facing receipt emission

Revisit when:

- a public adapter or external caller can emit or persist session-resume
  receipts
- receipt provenance becomes visible to downstream policy, diagnostics, or
  audit consumers

Preferred direction:

- require an authenticated principal when the action is actor-owned, or
- replace the string literal with a stable system actor reference

Primary references:

- `packages/core/src/projection-engine/session-pack.ts`
- `docs/OPERATIONAL-SESSION-MEMORY-RFC-V2.md`

### SN-2026-04-23-003. Retrieval suppression preview policy is not yet uniform

Current state:

- hybrid retrieval in `exact-vector.ts` now clears `text_preview` for legally
  suppressed candidates such as `authority_mismatch` and
  `unsupported_wiki_claim`
- normalized external candidates in `external-candidates.ts` still clear
  `text_preview` only for `visibility_scope_mismatch`

Implication:

- suppression semantics are currently pipeline-specific
- two suppressed candidates can carry different preview behavior depending on
  whether they came from local hybrid retrieval or external normalization

Current posture:

- acceptable under the current trust model because suppressed candidates remain
  traceable and cannot support promotion when legally suppressed
- this asymmetry should stay explicit until the project decides whether preview
  stripping is a uniform retrieval law or a path-specific policy choice

Revisit when:

- suppressed candidate traces become more broadly exposed
- retrieval suppression needs one uniform privacy/authority rule
- the collaboration trust model tightens

Primary references:

- `packages/core/src/retrieval-engine/exact-vector.ts`
- `packages/core/src/retrieval-engine/external-candidates.ts`

---

## 3. Review Hygiene

When a review produces a note that is:

- not a correctness bug
- not yet a binding decision
- but still important for future hardening

the note should be summarized here instead of being left only in review text,
tests, or code comments.
