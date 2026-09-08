---
---

Runs both schema adapters against the official JSON Schema Test Suite at a pinned revision, and gates drift rather than the pass rate. The one code fix is in `@texaryn/schema-json-hyperjump`, which is private and ignored by changesets, so nothing publishable changes.
