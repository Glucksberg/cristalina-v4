# Cristalina v4
## Knowledge Wiki Layer

**Status:** Draft  
**Purpose:** Define the role of the persistent synthesized wiki inside the Cristalina v4 architecture

---

## 1. Why This Layer Exists

One of the strongest recent patterns in LLM-native knowledge systems is the maintained wiki:

- source summaries
- entity pages
- topic pages
- comparison pages
- indexes
- logs

The insight is simple:

most systems either:

- store raw sources and rediscover structure every time
- or maintain structured memory that is powerful for machines but awkward for humans to browse

The knowledge wiki exists to solve a different problem:

**make accumulated knowledge readable, navigable, cross-linked, and compounding over time.**

This pattern was articulated especially clearly in Andrej Karpathy's "LLM Wiki" note, where the wiki acts as a persistent knowledge artifact maintained by the LLM instead of being manually curated page by page.

That idea is valuable enough to become a first-class architectural layer in Cristalina v4.

---

## 2. What the Wiki Layer Is

The wiki layer is:

- persistent
- LLM-maintained
- cross-linked
- readable by humans
- readable by agents
- derived from deeper layers and sources

It is an **editorial memory layer**.

Its purpose is not to replace structured memory or governed memory.

Its purpose is to make accumulated understanding durable and navigable.

---

## 3. What the Wiki Layer Is Not

The wiki layer is not:

- the raw source layer
- the temporal world model
- the canonical memory layer
- the governance layer
- the runtime self layer

This matters because the wiki will often contain statements that look truth-like.

Those statements may be:

- very useful
- strongly synthesized
- operationally reliable

But they are still derived artifacts unless and until they pass through the canonical promotion path.

---

## 4. Core Functions

The wiki layer should support at least these functions:

### 4.1 Source summarization

When a new source arrives, the system should be able to create:

- a source page
- a concise summary
- key takeaways
- notable claims
- source links

### 4.2 Entity accumulation

The system should be able to maintain entity pages for:

- people
- projects
- organizations
- concepts
- places
- systems

These pages should accumulate references and synthesized understanding over time.

### 4.3 Topic synthesis

The system should be able to maintain topic pages that summarize:

- the current state of understanding
- major tensions
- competing interpretations
- unresolved questions
- links to related entities and sources

### 4.4 Comparative reasoning

The system should be able to create comparison pages when that helps future reasoning.

Examples:

- framework vs framework
- person vs person
- design option vs design option
- theory A vs theory B

### 4.5 Navigation

The system should maintain:

- an `index`
- a chronological `log`
- cross-links between pages
- possibly tags, frontmatter, or lightweight metadata

This makes the wiki layer usable as a living environment, not just as a pile of files.

---

## 5. Relationship to the Other Layers

### 5.1 Relationship to Raw Sources

Raw sources are the evidence bedrock.

The wiki should summarize and connect them, not replace them.

### 5.2 Relationship to the Temporal World Model

The world model is machine-optimized structure:

- entities
- relations
- temporal validity
- evolving state

The wiki may describe that structure in a human-readable way, but it is not the authoritative structural store.

### 5.3 Relationship to Canonical Memory

Canonical memory is governed durable truth.

The wiki may explain, summarize, and contextualize canonical memory.

It does not get to redefine it.

### 5.4 Relationship to Runtime Projections

Runtime projections may include excerpts or summaries from the wiki.

Those excerpts should remain labeled as wiki-derived, not canonical.

---

## 6. Authority Rules

The wiki layer should obey strict authority rules:

1. wiki pages are derived artifacts
2. wiki pages may contain claims
3. wiki claims do not become canonical automatically
4. wiki claims that imply durable truth should emit proposal candidates
5. canonical truth should be linkable from the wiki
6. wiki revisions should preserve references to sources and upstream objects when possible

These rules allow the wiki to be highly useful without becoming an ungoverned second canon.

---

## 7. Information Model

The wiki layer likely needs its own lightweight object family or metadata model.

At minimum:

- `wiki_page`
- `wiki_revision`
- `wiki_link`
- `wiki_claim`
- `source_record`

Suggested metadata per page:

- page id
- title
- page kind
- created_at
- updated_at
- source refs
- canonical refs
- world-model refs
- outgoing links
- incoming links or index support

The exact representation may be markdown plus frontmatter, markdown plus sidecar metadata, or a structured storage layer that compiles to markdown.

That implementation choice can remain open for now.

---

## 8. Maintenance Operations

The wiki layer should support at least these operations:

### 8.1 Ingest source

- create source summary
- update index
- link relevant pages
- note tensions or contradictions

### 8.2 Refresh page

- revise an entity or topic page based on new sources or world updates

### 8.3 Create comparison

- generate a new comparative page when repeated reasoning suggests it is useful

### 8.4 Lint wiki

- detect orphan pages
- detect stale pages
- detect broken links
- detect unsupported claims
- detect pages that mention unresolved contradictions

### 8.5 Emit proposal candidates

When a wiki revision appears to state durable truth, the system should be able to emit:

- a canonical memory proposal
- a world-model update candidate
- or a diagnostic asking for review

---

## 9. Why This Makes Cristalina v4 Stronger

Adding the wiki layer gives the architecture something none of the older ancestors fully unify on their own:

- not just memory
- not just world structure
- not just governance

but also:

- **durable synthesized understanding**

This matters because many high-value reasoning artifacts are neither:

- raw evidence
- nor canonical truth

They are:

- explanations
- overviews
- comparisons
- thematic syntheses
- accumulated maps of a domain

Those are exactly the things that disappear in ordinary chat systems and get painfully rebuilt over and over.

The wiki layer lets them persist.

---

## 10. Final Rule

The wiki should be treated as:

- editorial
- persistent
- compounding
- useful
- non-sovereign

That is the right place for it in Cristalina v4.
