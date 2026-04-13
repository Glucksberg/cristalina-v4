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

- `projection-read-v1`

---

## 2. Scope

This policy is intentionally narrow.

It does not attempt to solve:

- broad relevance ranking
- enterprise-style permissions
- all privacy scopes
- all future projection audiences

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

### 4.2 Historical and disputed claims

For `audience: runtime`:

- `historical` or `disputed` world claims must not enter the active `World Claims` section
- they must remain visible in a trace surface instead of disappearing

The current OpenClaw projection uses:

- `## World Claims` for active claims
- `## World Trace` for historical or disputed claims

### 4.3 Suppression must remain inspectable

Suppression is legal only when the manifest preserves:

- `suppressed_refs`
- `suppressed_records`

Each suppressed record must retain at least:

- `id`
- `kind`
- `reason_code`

This is the minimum audit trail that prevents the read path from becoming silent or magical.

---

## 5. Current Reason Codes

The current executable baseline may emit reason codes such as:

- `runtime_instance_mismatch`
- `runtime_session_mismatch`
- `conversation_thread_mismatch`
- `runtime_private_requires_projection_context`
- `runtime_private_missing_context_binding`

These codes are operational diagnostics.

They are not yet a full policy ontology.

---

## 6. Non-Goals of v1

`projection-read-v1` does not yet define:

- owner-private relevance gating
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
- historical/disputed claims appear as active current context
- suppressed records leave no machine-readable audit trail

That is the minimum read-discipline bar for the current phase.
