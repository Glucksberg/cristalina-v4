# Cristalina v4
## Group Interaction Model

**Status:** Active Draft  
**Purpose:** freeze the product-facing memory and authority model for the initial `single owner + many participants` phase used by OpenClaw and Hermes.

---

## 1. Why This Document Exists

The repository already distinguishes:

- durable identity
- runtime execution context
- world state
- governed canon

What still needed to become explicit is the operating model for group interaction.

Cristalina v4 is not targeting:

- many competing owners for the same agent
- private participant silos inside one group
- per-user hidden memories inside the same runtime thread

The target product model is:

- one durable `owner`
- one `agent` operated on behalf of that owner
- zero or more `participants`
- shared agent memory across the interaction surface

This document freezes that story so docs, types, fixtures, and kernel work stop drifting.

---

## 2. Core Authority Model

The initial product line should assume:

- `owner`: the durable authority primarily responsible for the agent
- `agent`: the operational identity executing behavior in a runtime
- `participant`: any non-owner person or organization interacting with the agent
- `speaker`: the actor that produced one specific turn, message, or evidence item

`speaker` is a contextual event role.

It is not a fourth durable identity family.

In practice, a speaker may be:

- the `owner`
- the `agent`
- a `participant`

There is no separate `responsible_owner` concept in the target phase.

For the current product, the owner responsible for the runtime or thread is simply the runtime's `owner`.

---

## 3. Shared-Memory Rule

Cristalina v4 should assume shared memory inside the owner-controlled group surface.

That means:

- participant interactions contribute to the same agent memory substrate
- the system should not model hidden per-participant memory silos inside one group
- projection discipline exists to preserve runtime legality, temporal correctness, and auditability
- projection discipline does **not** exist to hide memory from one participant while showing it to another participant in the same owner-controlled context

The current `visibility_state.privacy_scope` field therefore should be treated as:

- runtime handling metadata
- publication or export metadata
- compatibility scaffolding from earlier hardening passes

It should **not** be treated as the long-term authority model for participant visibility.

---

## 4. Authority Law

Group participation does not change authority.

The system should preserve these rules:

- participant speech is not owner speech
- evidence from participants may update `world`, `wiki`, or `queued_review`
- statements about the owner do not become canonical owner memory merely because they were said in the owner's group
- promotion to `canon` must remain compatible with owner authority or an explicit ratification law
- when owner authority is missing, the kernel should materialize an explicit owner-ratification queue entry instead of depending on replay of the original intake payload
- that queue must support explicit closure paths for approval, rejection, and expiration

This is the central distinction:

- group memory is shared
- authority is not shared

---

## 5. Intake Implications

The intake kernel should preserve at least these distinctions:

1. who is the durable `owner`
2. who is the `agent`
3. who was the `speaker` for this event
4. who is the `subject` of the emitted claim

Those axes must not collapse into one `owner_label`.

In particular:

- the default group-conversation subject should not silently become the owner
- structured imports may name explicit subjects such as customers, users, or organizations
- owner-targeted intake should mark that subject with explicit authority role instead of relying on label heuristics
- owner-directed authority should be a governance decision, not a profile default

---

## 6. Provenance Rule

The write path should preserve enough provenance to answer two different questions:

1. which runtime identity context emitted this record
2. which actor actually produced the underlying message or evidence

The first question is already partly modeled through runtime refs.

The second should converge around an explicit `speaker` field in provenance and fixtures.

That lets the kernel answer:

- the owner said this
- a participant said this
- the agent inferred this

without inventing a new authority system.

---

## 7. Projection Rule

Projection should compile the shared memory state of the owner-controlled agent context.

It should not:

- pretend participant-originated claims are owner-authored claims
- erase contradiction trace just to make the projection cleaner
- silently promote wiki or world summaries into owner canon

Projection needs attribution and traceability more than secrecy.

---

## 8. Immediate Kernel Gaps

The current executable baseline still has three important gaps relative to this model:

1. participant and speaker attribution are not first-class in the intake write path
2. the preference intake profile can still bias the default subject toward owner context unless explicitly overridden
3. visibility scopes still carry more semantic weight than they should for the shared-memory product model

These are kernel hardening gaps, not adapter concerns.

---

## 9. Design Rule

For the current Cristalina line, every new flow should be checked against this sentence:

`single owner authority, shared group memory, explicit speaker provenance, governed canonical promotion`

If a flow violates any part of that sentence, it is either early or mis-layered.
