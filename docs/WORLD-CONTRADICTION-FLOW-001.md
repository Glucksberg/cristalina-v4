# Cristalina v4
## World Contradiction Flow 001
### Observation -> Episode -> WorldClaim -> Contradiction -> ContradictionResolution -> Application -> Projection

**Status:** Draft  
**Purpose:** Freeze one applied contradiction-resolution flow before contradiction handling expands

---

## 1. Why This Flow

The repository already detects contradictions and can propose a resolution.

The next hardening step is to prove the whole legal path, including the applied effect on world state and projection output.

This flow exists to prove that:

- contradiction detection becomes a durable world object
- contradiction handling becomes a durable governance object
- applying the resolution preserves temporal history instead of overwriting the past
- projection shows the conflict and its handling explicitly

---

## 2. Scenario

Input sequence:

1. an earlier observation supports an active world claim:
   the user prefers exhaustive answers
2. a later observation supports a new active world claim:
   the user prefers concise answers
3. the system detects those active claims as incompatible
4. the system proposes `coexist_temporally`
5. the resolution is accepted and applied

Expected effect:

- the older world claim becomes `disputed` and `historical`
- the newer world claim remains the active claim
- the contradiction remains visible as a resolved record
- the contradiction resolution becomes visible as an applied governance record
- the projection exposes all of that without collapsing world, wiki, and canon together

---

## 3. Step-by-Step Flow

### Step 1. Capture the new signal

Created objects:

- `Observation`
- `Episode`
- `Entity`
- `Relation`
- `WorldClaim`

Meaning:

- the system has a new world candidate with explicit temporal support

### Step 2. Detect the active conflict

Created object:

- `Contradiction`

Meaning:

- two live world claims now stand in explicit tension

### Step 3. Propose a legal handling path

Created object:

- `ContradictionResolution`

Meaning:

- the system records how the contradiction should be handled instead of leaving it as anonymous tension

### Step 4. Apply the accepted resolution

Updated objects:

- existing `WorldClaim`
- `Contradiction`
- `ContradictionResolution`

Legal effect:

- the losing world claim is closed historically
- the contradiction becomes `resolved`
- the resolution becomes `applied`

Important constraint:

- the losing claim is not deleted
- the world model preserves the previous active interval explicitly

### Step 5. Compile projection

Projection must show:

- the active world claim
- the historical/disputed world claim
- the resolved contradiction
- the applied contradiction resolution
- separate world and wiki sections
- separate canon and world sections

---

## 4. What This Flow Proves

This flow proves that contradiction handling is not just detection.

It proves a legal, inspectable sequence from:

- evidence
- to world tension
- to governance handling
- to temporal world update
- to runtime-facing projection

That is the minimum executable substrate needed before contradiction behavior grows more elaborate.
