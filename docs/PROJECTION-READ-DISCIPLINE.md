# Cristalina v4
## Projection Read Discipline

**Status:** Draft  
**Purpose:** freeze the first explicit read-path policy for runtime projections so projection selection becomes inspectable instead of remaining an implicit side effect of compilation.

---

## 1. Why This Document Exists

The repository already treats projection as derived.

That is necessary but not sufficient.

Projection also needs an explicit answer to:

- which records may enter active runtime context
- which records may appear only as trace
- which records must be suppressed
- how that suppression remains inspectable

This document freezes the first minimal policy version:

- `projection-read-v2`

---

## 2. Scope

This policy is intentionally narrow.

It does not attempt to solve:

- broad relevance ranking
- enterprise-style permissions
- all privacy scopes
- all future projection audiences

For the current product line, this policy also does not define participant-to-participant secrecy inside one owner-controlled group. Group memory is shared; read discipline exists here for context legality and auditability.

It freezes only the current executable baseline for runtime projection.

---

## 3. Read Context

`projection-read-v1` assumes the compiler knows:

- adapter
- audience
- actor identity ref when available
- runtime instance ref when available
- runtime session ref when available
- conversation thread ref when available

This context must be preserved in `ProjectionManifest.context_refs`.

---

## 4. Policy Rules

### 4.1 Runtime-private context matching

If a record is `runtime_private`, it may enter the runtime projection only when its runtime/session/thread binding matches the active projection context.

If the binding does not match, the record must be suppressed.

If a `runtime_private` record lacks any runtime/session/thread binding, it must also be suppressed rather than treated as broadly readable.

### 4.2 Owner-private scoped matching

If a record is `owner_private` and also carries runtime/session/thread binding, it may enter the active runtime projection only when that scoped binding matches the active projection context.

If the projection context is broader than the record binding, the record must be suppressed instead of becoming active context by omission.

If an `owner_private` record is unscoped, it may enter projection only when identity binding still matches the active owner or actor context.

If an unscoped `owner_private` record lacks identity binding, it must be suppressed rather than treated as broadly readable.

This is a compatibility rule for the current executable baseline, not a statement that group participants should have isolated hidden memories.

### 4.3 Historical and disputed claims

For `audience: runtime`:

- `historical` or `disputed` world claims must not enter the active `World Claims` section
- they must remain visible in a trace surface instead of disappearing

The current OpenClaw projection uses:

- `## World Claims` for active claims
- `## World Trace` for historical or disputed claims
- `## Review Queue` for pending governed review items
- `## Review Trace` for review items already applied, answered, or expired

### 4.4 Suppression must remain inspectable

Suppression is legal only when the manifest preserves:

- `suppressed_refs`
- `suppressed_records`
- `review_refs` when governed review items are visible in the projection

Each suppressed record must retain at least:

- `id`
- `kind`
- `reason_code`

This is the minimum audit trail that prevents the read path from becoming silent or magical.

---

## 5. Current Reason Codes

The current executable baseline may emit reason codes such as:

- `runtime_private_runtime_instance_mismatch`
- `runtime_private_runtime_session_mismatch`
- `runtime_private_conversation_thread_mismatch`
- `runtime_private_requires_projection_context`
- `runtime_private_missing_context_binding`
- `owner_private_runtime_instance_mismatch`
- `owner_private_runtime_session_mismatch`
- `owner_private_conversation_thread_mismatch`
- `owner_private_requires_projection_context`
- `owner_private_requires_identity_context`
- `owner_private_missing_identity_binding`
- `owner_private_identity_mismatch`
- `owner_private_identity_match`

These codes are operational diagnostics.

They are not yet a full policy ontology.

---

## 6. Non-Goals of v1

`projection-read-v2` does not yet define:

- agent-operational gating
- task-sensitive memory ranking
- query-sensitive retrieval law
- suppression of historical/disputed records into invisibility

The current policy is intentionally conservative.

It prefers:

- explicit trace over silent loss
- explicit suppression over accidental leakage

---

## 7. Eval Rule

The core should be considered under-hardened if:

- runtime-private cross-context records leak into active runtime projection
- owner-private scoped records become active in broader runtime context without a matching binding
- historical/disputed claims appear as active current context
- suppressed records leave no machine-readable audit trail

That is the minimum read-discipline bar for the current phase.
