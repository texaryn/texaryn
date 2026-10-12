---
'@texaryn/svelte': minor
'@texaryn/solid': minor
---

FormRoot now renders the UI tree without creating a native form. Consumers own
the form element and connect its submit event to the runtime.
