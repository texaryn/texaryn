---
'@texaryn/schema-json': patch
'@texaryn/react': patch
---

Depend on `@texaryn/core` through a caret range rather than an exact version. The previous exact pin made each release usable only against the single `@texaryn/core` build it shipped beside, which forced all three packages to move together. They now version independently, so a version describes that package's own public contract.
