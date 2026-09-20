---
'@texaryn/vue': minor
---

`ErrorSummary` renders a jump-linked list of the runtime's visible errors,
placed by the application above `FormRoot` the way React's is. Each link
targets the input the renderer mounted, inside the namespace
`provideFormRuntime` opened. It is not a live region: the fields already
announce their own errors.
