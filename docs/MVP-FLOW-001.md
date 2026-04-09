# Cristalina v4
## MVP Flow 001
### Conversation -> Observation -> World -> Wiki -> Proposal -> Canon -> OpenClaw Projection

**Status:** Draft  
**Purpose:** Freeze one end-to-end MVP flow before implementation branches

---

## 1. Why This Flow

The first MVP flow should be small enough to implement cleanly and rich enough to prove the architecture.

This flow does that.

It proves:

- runtime input handling
- observation capture
- world-model update
- wiki maintenance
- proposal generation
- governance
- canonical promotion
- runtime projection

---

## 2. Scenario

Input conversation:

The user says they prefer concise answers unless they explicitly ask for depth.

This should produce:

- an `observation`
- a world-model update
- a wiki update
- a `disposition_record`
- a canonical `preference` proposal
- a ratified canonical memory object
- an OpenClaw projection that now reflects the new preference

---

## 3. Step-by-Step Flow

### Step 1. Runtime receives conversation turn

Input:

- user utterance
- runtime metadata
- session context

Output:

- runtime-local input event

### Step 2. Core records an `Observation`

Created object:

- `Observation`

Meaning:

- something was said that may matter

This is not yet:

- a world truth
- a canonical memory

### Step 3. Core updates the world model

Created or updated object:

- `WorldClaim`

Meaning:

- the system currently believes the user likely has a communication preference

This is structurally useful before it is canonically confirmed.

### Step 4. Wiki maintenance updates editorial knowledge

Created or updated objects:

- `WikiPage`
- optionally `WikiClaim`

Examples:

- user model page
- communication preferences summary
- log entry

This is editorial accumulation, not truth promotion.

### Step 5. Proposal generation emits a candidate

Created object:

- `Proposal`

Operation:

- `create`

Target:

- `canon`

Candidate kind:

- `preference`

### Step 6. Disposition is recorded

Created object:

- `DispositionRecord`

Meaning:

- the system can explain that this intake produced:
  - `world_update`
  - `wiki_update`
  - `proposal_for_canon`

### Step 7. Governance evaluates the candidate

Gates crossed:

- structural
- evidence
- policy
- ratification

If accepted:

- proceed to canon

If not:

- remain as evidence, world state, or queued proposal

### Step 8. Canonical memory is updated

Created object:

- `CanonicalMemoryObject`

Kind:

- `preference`

Meaning:

- durable governed truth about the user's interaction preference

### Step 9. Projection compiler runs

Inputs:

- runtime self
- world model
- canon
- wiki
- diagnostics

Outputs:

- OpenClaw projection artifact

### Step 10. OpenClaw reads updated projection

Effect:

- the runtime now behaves differently because the preference is present in its compiled context

---

## 4. What This Flow Proves

This single flow proves that the architecture can:

- distinguish observation from truth
- distinguish world state from canon
- let the wiki accumulate useful synthesis
- explain the explicit fate of the input before canon
- keep governance between candidate and canon
- feed the resulting memory back into a runtime

That is enough to justify implementing the core around this flow first.

---

## 5. What This Flow Does Not Prove Yet

This flow does not yet prove:

- contradiction handling depth
- supersession chains
- Hermes integration
- graph-heavy relation reasoning
- multi-source synthesis
- complex wiki-page maintenance

Those can come later.
