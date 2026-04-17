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
- explicit access to `diagnostics`, `reviews`, `pending_reviews`, and `closed_reviews`
- consumption of `ProjectionManifest.review_refs` and Hermes projection artifacts without defining new memory law in the adapter
