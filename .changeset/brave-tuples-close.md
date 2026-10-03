---
'@texaryn/schema-json': patch
---

Projecting a schema whose `items` is the boolean `false` no longer throws in 2020-12. A tuple closed with `prefixItems` and `items: false` projects as an array.
