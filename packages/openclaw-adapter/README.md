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
- explicit access to `diagnostics`, `reviews`, `pending_reviews`, and `closed_reviews`
- consumption of `ProjectionManifest.review_refs` and bootstrap review sections without defining new memory law in the adapter
- authenticated write-through ingress for conversation preference and OpenClaw feedback flows
- authenticated owner/system queue actions forwarded to the core without redefining authority law
