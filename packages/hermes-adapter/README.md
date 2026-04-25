# Hermes Adapter

This package will adapt the Cristalina v4 core to Hermes Agent runtime projections and ingest.

Planned responsibilities:

- Hermes-facing projection contract
- Hermes ingest contract
- runtime diagnostics feedback
- compatibility mapping between Hermes runtime expectations and Cristalina memory law

Current executable surface:

- projection runtime loader by manifest id
- latest projection runtime loader
- explicit access to `diagnostics`, `retrieval_context`, `reviews`, `pending_reviews`, and `closed_reviews`
- consumption of `ProjectionManifest.review_refs` and Hermes projection artifacts without defining new memory law in the adapter
- consumption of projection manifest retrieval traces without redefining retrieval ranking, authority, or suppression law
- authenticated write-through ingress for Hermes conversation-preference flows
- authenticated non-canonical write-through for `evidence_only`, `runtime_only`, and `diagnostic_only` intake
- authenticated owner/system queue actions forwarded to the core without redefining authority law
