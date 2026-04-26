# OpenClaw Adapter

This package will adapt the Cristalina v4 core to OpenClaw runtime projections and ingest.

Planned responsibilities:

- OpenClaw projection surfaces
- OpenClaw ingest and drift handling
- runtime diagnostics feedback
- projection manifest compatibility

Current executable surface:

- projection runtime loader by manifest id
- latest projection runtime loader
- explicit access to `diagnostics`, `retrieval_context`, `reviews`, `pending_reviews`, and `closed_reviews`
- consumption of `ProjectionManifest.review_refs` and bootstrap review sections without defining new memory law in the adapter
- consumption of projection manifest retrieval traces without redefining retrieval ranking, authority, or suppression law
- authenticated write-through ingress for conversation preference and OpenClaw feedback flows
- authenticated non-canonical write-through for `evidence_only`, `runtime_only`, and `diagnostic_only` intake
- explicit adapter drift diagnostics through bounded `diagnostic_only` intake
- authenticated owner/system queue actions forwarded to the core without redefining authority law
