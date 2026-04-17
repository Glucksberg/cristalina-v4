# Cristalina v4
## Runtime Identity

**Status:** Active Draft  
**Purpose:** Freeze the distinctions between durable identity and runtime execution context before adapters arrive.

---

## 1. Why This Document Exists

Agent memory systems often blur together:

- who the agent is
- which runtime is executing it
- which session is active
- which thread is being spoken in

That blur becomes expensive once more than one runtime exists.

Cristalina v4 must not make that mistake.

---

## 2. Identity Thesis

The architecture should distinguish at least four things:

1. **durable identity**
2. **runtime instance**
3. **runtime session**
4. **conversation thread**

These are related.

They are not interchangeable.

For the current product line, runtime identity also assumes:

- one durable `owner` per agent lineage
- one `agent` identity executing on behalf of that owner
- zero or more non-owner participants sharing the same agent memory context

`speaker` remains an event-level role attached to turns or evidence, not a new durable identity family.

---

## 3. Core Families

### 3.1 `ActorIdentity`

Represents a durable identity such as:

- owner
- agent
- external person
- external organization

In the current group model, non-owner humans or organizations may participate in interaction without becoming co-owners of the runtime.

### 3.2 `RuntimeInstance`

Represents one active embodiment of the agent in:

- OpenClaw
- Hermes
- another future runtime

### 3.3 `RuntimeSession`

Represents a bounded interval of ongoing work or interaction inside a runtime instance.

### 3.4 `ConversationThread`

Represents one interaction branch inside a session.

The thread is still owner-scoped even when many participants speak inside it.

That means:

- memory may be shared across participants in the same owner-controlled context
- authority still anchors to the runtime's owner identity
- turn-level attribution must come from provenance, not from thread ownership alone

---

## 4. Persistence Rule

### Durable

- `ActorIdentity`

### Runtime-persistent but non-canonical

- `RuntimeInstance`
- `RuntimeSession`
- `ConversationThread`
- `RuntimeMemoryBlock`

This matters because runtime continuity is real without being canon.

---

## 5. Storage Rule

The runtime layer should reserve first-class space for:

- `runtime/instances`
- `runtime/sessions`
- `runtime/threads`
- `runtime/blocks`
- `runtime/working-memory`

The canonical identity layer should preserve durable self and owner identity separately from runtime execution state.

It should not silently collapse all group participants into the owner identity just because they share a thread.

---

## 6. Projection Rule

Projection packages should carry enough metadata to answer:

1. which agent identity this package serves
2. which runtime instance it belongs to
3. which session it was compiled for, if any
4. which thread-specific context it includes, if any

Without this, cross-runtime continuity turns vague fast.

### Executable baseline

The current core baseline now materializes:

- `ActorIdentity`
- `RuntimeInstance`
- `RuntimeSession`
- `ConversationThread`

inside the preference intake flow and reuses those refs inside projection manifests and OpenClaw bootstrap rendering.

---

## 7. Adapter Rule

OpenClaw and Hermes may package state differently.

They must not redefine:

- what an agent identity is
- what a runtime instance is
- what a session is
- what a thread is

The adapter layer may translate.

It may not legislate identity semantics.
