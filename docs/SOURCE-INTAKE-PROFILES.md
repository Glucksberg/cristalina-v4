# Cristalina v4
## Source Intake Profiles

**Status:** Active Draft  
**Purpose:** Freeze the profile contract that lets new sources reuse the same intake kernel without redefining memory semantics

---

## 1. Why This Document Exists

The repository already has one executable intake kernel for preference-like signals.

What changes between sources is not the legality of the flow.

What changes is the semantic profile that shapes:

- how the observation is phrased
- how the episode is summarized
- which entity and relation labels are emitted
- which wiki page receives the editorial update
- which proposal reason is attached

This document freezes that distinction so adapters and importers extend contracts instead of cloning workflows.

---

## 2. Current Executable Intake Kinds

The current baseline supports these intake kinds:

- `conversation_preference`
- `openclaw_projection_feedback`
- `structured_preference_signal`

Each kind resolves into one effective profile and then reuses the same kernel write path.

---

## 3. Effective Profile Contract

An effective intake profile must preserve at least:

- `intake_kind`
- `observation_prefix`
- `episode_summary`
- `wiki_title`
- `wiki_path`
- `proposal_reason`
- `subject_entity_kind`
- `subject_label`
- `preference_topic_label`
- `relation_type`

Only `observation_prefix` is optional.

The rest are required because they determine the emitted semantics of the world, wiki, and governance artifacts.

---

## 4. What The Profile May Shape

The profile may change:

- observation wording
- episode wording
- entity and relation labels
- wiki placement
- proposal explanation

The profile must not change:

- layer ownership
- provenance model
- disposition routing law
- contradiction handling semantics
- governance authority boundaries

That means the profile is semantic configuration, not a permission system.

---

## 5. Legal Output Shape

The current executable preference-signal intake emits:

- `Observation`
- `Episode`
- `Entity`
- `Relation`
- `WorldClaim`
- `WikiPage`
- `WikiClaim`
- `Proposal`
- `DispositionRecord`

Runtime identity records may also be emitted when the source provides identity context:

- `ActorIdentity`
- `RuntimeInstance`
- `RuntimeSession`
- `ConversationThread`

The intake profile chooses labels inside that output shape.

It does not choose a new output shape.

---

## 6. Convergence Rule

If a new source requires a different semantic profile but the same legal output shape, it should register a new intake kind or override set.

If it requires a different output shape, the repository should first document that as a new kernel contract before adding another workflow.
