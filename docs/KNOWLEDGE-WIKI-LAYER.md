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

The useful part to preserve is not merely "Markdown files".

The useful part is the maintenance loop:

- raw sources remain immutable
- the LLM incrementally compiles those sources into a persistent cross-linked wiki
- the wiki has a small navigational index and chronological log
- query answers and investigations can become new wiki pages when they add durable synthesis
- lint/review keeps the wiki healthy by finding stale claims, contradictions, orphan pages, broken links, and missing concepts

Cristalina adopts that loop, but with a stricter authority model: wiki synthesis can guide reasoning and emit candidates, but it cannot become canon without governance.

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

### 4.6 Query synthesis capture

When a user asks a question and the answer produces reusable understanding, the system should be able to file that answer back into the wiki as a maintained page.

Examples:

- an analysis page
- a comparison page
- a synthesis page
- a reading trail
- a research question page

This is one of the core advantages of the LLM Wiki pattern: exploration should compound instead of disappearing into chat history.

In Cristalina, query-derived pages must preserve upstream refs to the wiki/source/world/canon records they used.

They must not become proposal sources merely because the prose is persuasive.

### 4.7 Wiki health review

The wiki should support periodic maintenance passes that inspect the wiki as a graph of pages and links.

At minimum, health review should detect:

- orphan pages
- broken wikilinks
- important mentioned concepts without pages
- duplicated pages that should be merged or linked
- stale claims superseded by newer sources or world state
- unsupported claims with weak or missing upstream refs
- contradictions between wiki pages or between wiki pages and active world claims
- data gaps that should become source-seeking questions instead of invented content

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

Expected page families:

- source summary pages
- entity pages
- concept/topic pages
- comparison pages
- synthesis pages
- query-answer pages worth preserving
- research-question pages
- index pages
- maintenance logs

Suggested metadata per page:

- page id
- title
- page kind
- created_at
- updated_at
- source refs
- canonical refs
- world-model refs
- wiki claim refs
- outgoing links
- incoming links or index support
- one-line index summary
- source count or upstream count
- stale/review status when applicable
- quality score
- retention priority

Suggested lifecycle metadata per claim:

- confidence score
- support count
- last confirmed timestamp
- last seen timestamp
- staleness state
- supersession refs
- quality score
- retention priority

The exact representation may be markdown plus frontmatter, markdown plus sidecar metadata, or a structured storage layer that compiles to markdown.

That implementation choice can remain open for now.

The `index.md` contract should be content-oriented:

- list every maintained wiki page or every page above a configured importance threshold
- group pages by kind or domain
- include a short one-line summary
- include useful lightweight metadata such as last updated date, page kind, and upstream/source count
- remain small enough to serve as the first navigation document for LLM query and maintenance flows

The `log.md` contract should be chronological and append-oriented:

- record ingests, refreshes, query captures, lint passes, and review actions
- use a consistent heading prefix that simple tools can parse
- preserve what changed and which upstream refs drove the change
- avoid acting as the source of truth for the content itself

---

## 8. Maintenance Operations

The wiki layer should be maintained by formal events. Core workflow entrypoints may be invoked directly for tests, replay, recovery, and operator-forced repair, but manual invocation is an operational fallback, not the product model.

The event vocabulary is:

- `source_ingested`
- `page_refreshed`
- `query_captured`
- `lint_run`
- `claim_superseded`
- `session_crystallized`
- `retention_reviewed`

The wiki layer should support at least these operations:

### 8.1 Ingest source

- create source summary
- update index
- link relevant pages
- update existing entity, concept, topic, and comparison pages touched by the source
- note tensions or contradictions
- append a parseable log entry
- preserve source refs and upstream refs on every changed page or sidecar record

### 8.2 Refresh page

- revise an entity or topic page based on new sources or world updates
- preserve prior upstream refs and add new refs rather than silently replacing provenance
- mark older claims as stale, disputed, or superseded when appropriate

### 8.3 Create comparison

- generate a new comparative page when repeated reasoning suggests it is useful
- cite the source/wiki/world/canon records that support each side of the comparison

### 8.4 Capture query result

- turn a high-value answer into a durable wiki page
- record which pages and upstream refs were used to answer
- update index and log
- preserve the page as synthesis, not canon

### 8.5 Lint wiki

- detect orphan pages
- detect stale pages
- detect broken links
- detect unsupported claims
- detect pages that mention unresolved contradictions
- detect important unlinked concepts
- detect duplicate or near-duplicate pages
- emit diagnostics and source-seeking questions where evidence is missing

### 8.6 Emit proposal candidates

When a wiki revision appears to state durable truth, the system should be able to emit:

- a canonical memory proposal
- a world-model update candidate
- or a diagnostic asking for review

Proposal candidates must be based on referenced upstream objects, not on wiki prose alone.

If the wiki prose cannot be traced to source, world, canon, or governance refs, the correct output is a diagnostic or research question, not a proposal.

### 8.7 Maintain memory browser projection

The wiki maintenance road should also compile a read-only Memory Browser projection.

The browser is an inspection surface over core records and projection manifests. It may show:

- wiki pages, claims, lifecycle state, graph edges, lint diagnostics, index, and log
- canon records and supersession chains
- world entities, relations, claims, contradictions, and temporal state
- governance proposals, ratifications, and review queues
- raw source records, imports, and attachment refs
- runtime instances, sessions, threads, and observations
- derived manifests, artifacts, suppression reasons, and read-policy context

The browser must not define memory semantics or mutate records. It consumes derived artifacts generated by the core.

---

## 9. Minimum Executable Wiki Flow

The first executable wiki-maintenance flow should prove one source through the full maintenance loop:

1. register immutable raw source
2. create or refresh a source summary page
3. update at least one entity or concept page
4. update `wiki/index.md`
5. append to `wiki/log.md`
6. extract at least one `wiki_claim` with upstream refs
7. run lint and produce either a clean result or bounded diagnostics
8. compile projection fragments that label wiki content as editorial
9. compile a read-only Memory Browser projection
10. prove that any proposal candidate dereferences upstream evidence instead of wiki prose alone

This is the smallest road that captures the Karpathy-style compounding wiki without violating Cristalina's governance model.

---

## 10. Why This Makes Cristalina v4 Stronger

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

## 11. Final Rule

The wiki should be treated as:

- editorial
- persistent
- compounding
- useful
- non-sovereign

That is the right place for it in Cristalina v4.
