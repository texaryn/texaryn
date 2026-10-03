---
'@texaryn/schema-json': patch
---

Validation and projection no longer throw for a data key named like an `Object.prototype` member, such as `__proto__`, `constructor` or `toString`. The key is validated like any other key.
