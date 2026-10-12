---
'@texaryn/schema-json': minor
---

Adds `checkSchema`, which reports where a schema itself is invalid. It runs the same preparation as `createJsonSchemaAdapter` and returns RFC 6901 pointers into the schema, escaping property names that contain `/` or `~`, and stopping at the shared prefix when the library's location is ambiguous.
