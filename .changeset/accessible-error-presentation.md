---
'@texaryn/core': minor
'@texaryn/react': minor
---

Add display-policy-aware error presentation. Core runtime computes `showErrors` per node (`touched && invalid`) and maintains a reactive `visibleErrors` aggregate. React prop getters set `aria-invalid` and error-linked `aria-describedby` only when `showErrors` is true. New `FieldErrors` component replaces inline error rendering in all default widgets. New standalone `ErrorSummary` component subscribes to `visibleErrors`.
