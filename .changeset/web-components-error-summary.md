---
'@texaryn/web-components': minor
---

`mountErrorSummary(container, form)` renders a jump-linked list of the
runtime's visible errors over the `Mount` that `mountForm` returned, which now
carries `runtime` and `idPrefix`, so every link resolves inside the namespace
the form was mounted under. Both are required members of the exported `Mount`
interface, so a hand-written `Mount` or a test double supplies them.
`<texaryn-form error-summary>` and the `errorSummary` property mount it as the
first child of the element's form. It is not a live region: the fields already
announce their own errors.
