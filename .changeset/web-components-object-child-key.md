---
'@texaryn/web-components': patch
---

Object children are keyed with `objectChildKey` from `@texaryn/core` instead of
a local copy of the same function, so this release needs the `@texaryn/core`
release that exports it. Rendering does not change.
