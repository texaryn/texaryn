---
'@texaryn/schema-json': patch
---

Validation errors report RFC 6901 pointers for property names that contain `/` or `~`. A missing required field named `a/b` is reported at `/a~1b`, so `validateAt` and the association of an error with its field find it.
