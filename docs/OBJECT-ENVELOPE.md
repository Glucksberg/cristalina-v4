# Cristalina v4
## Object Envelope

**Status:** Active Draft  
**Purpose:** Freeze the shared record envelope that every durable or semi-durable v4 object family must respect.

---

## 1. Why This Document Exists

The repository already knows many object families.

What it still risks is semantic drift between:

- docs
- schemas
- scaffold types
- future storage objects

The fix is not one giant `memory_item`.

The fix is one shared envelope with explicit axes.

---

## 2. Envelope Thesis

Every durable or semi-durable record should preserve these dimensions independently:

1. what kind of thing it is
2. which layer currently owns it
3. which layer is authoritative for it
4. what the system thinks epistemically about it
5. where it sits in governance
6. when it is believed to apply
7. who may see it
8. where it came from

If any one field tries to collapse several of those dimensions together, the architecture regresses.

---

## 3. Shared Envelope

The normalized envelope should look like this:

```yaml
id: rec-...
kind: preference
layer: canon
authoritative_home: canon
created_at: 2026-04-09T00:00:00Z
updated_at: 2026-04-09T00:00:00Z
epistemic_state: confirmed
governance_state: ratified
temporal_state:
  temporal_status: active
  valid_from: 2026-04-09T00:00:00Z
  valid_to: null
visibility_state:
  privacy_scope: owner_private
provenance:
  source_type: conversation
  source_ref: runtime/session-001#turn-18
  evidence_refs:
    - obs-...
upstream_refs:
  - obs-...
  - wcl-...
```

The exact optional fields may vary by family.

The axes may not disappear.

---

## 4. Required Fields

Every record that uses the shared envelope should preserve:

- `id`
- `kind`
- `layer`
- `authoritative_home`
- `created_at`
- `visibility_state`
- `provenance`

Claim-bearing records should also preserve:

- `epistemic_state`
- `temporal_state` when relevant

Governed records should also preserve:

- `governance_state`

---

## 5. Layer and Authority Rule

### 5.1 `layer`

`layer` answers:

- where this record lives now

### 5.2 `authoritative_home`

`authoritative_home` answers:

- which layer is allowed to define this record's truth or official state

Typical examples:

- a `wiki_page` has `layer: wiki` and `authoritative_home: wiki`
- a canonical preference has `layer: canon` and `authoritative_home: canon`
- a projection artifact has `layer: derived` while preserving upstream authority elsewhere

This distinction is mandatory because runtime and derived artifacts may copy content without owning it.

---

## 6. Object Classes

The envelope should support at least four broad classes cleanly.

### 6.1 Evidence-bearing records

Examples:

- `source_record`
- `observation`
- `episode`

### 6.2 Structural world records

Examples:

- `entity`
- `relation`
- `world_claim`
- `contradiction`

### 6.3 Governed records

Examples:

- `canonical_memory_object`
- `proposal`
- `curation_packet`
- `ratification_record`
- `policy_snapshot`
- `disposition_record`

### 6.4 Editorial and derived records

Examples:

- `wiki_page`
- `wiki_claim`
- `projection_artifact`
- `projection_manifest`
- `diagnostic`

---

## 7. Convergence Rule

For phase-0 hardening, the following must converge:

- the docs vocabulary
- the JSON schemas
- the TypeScript scaffold vocabulary

If one of those uses a materially different field language, the repo is not hardened yet.
