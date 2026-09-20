---
'@texaryn/web-components': minor
---

`mountForm(container, runtime, { registry, idPrefix, messages })` replaces the
four positional parameters, and the returned `Mount` gains `setMessages`. The
element gains a `messages` property that switches a mounted form in place.
`RenderContext.messages` is what a custom widget reads.

The options object is a break for callers of `mountForm`. Migration:

before

    mountForm(container, runtime, registry, idPrefix)

after

    mountForm(container, runtime, { registry, idPrefix })

A locale change recompiles no document, so `setMessages` reconciles the mounted
tree itself rather than unmounting it; focus, selection and caret position
survive the switch.
