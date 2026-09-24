---
'@texaryn/schema-json': patch
---

The README states when a schema's own `format` keywords are asserted: in
Draft 7, including a schema whose `$schema` is absent or unrecognized while the
fallback is `draft-07`, and never in 2019-09 or 2020-12, where declaring the
format-assertion vocabulary does not turn it on. The `format` keywords inside a
published metaschema reached through `$ref` are asserted in every dialect. No
code changes.
