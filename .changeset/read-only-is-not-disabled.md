---
'@texaryn/core': minor
'@texaryn/react': minor
'@texaryn/react-bootstrap': minor
'@texaryn/react-mui': minor
'@texaryn/vue': minor
'@texaryn/web-components': minor
---

Render a schema's `readOnly` as read-only rather than disabled, and enforce it in the runtime.

A disabled control is not focusable and is announced differently; a read-only one stays focusable and selectable, which is what `readOnly` means. Compiled nodes now carry a resolved `readOnly` that a read-only object or array passes to everything beneath it, because editing a descendant changes the ancestor's value. The runtime refuses `SetValue`, `InsertItem`, `RemoveItem` and `MoveItem` on a read-only node, so a custom widget set cannot write past the restriction; `Reset` stays allowed as the owning authority replacing state. Renderers use the native `readonly` attribute where HTML has one and `aria-readonly` plus refusing the change where it does not, which is select and checkbox. `disabled` remains part of the node API, but the compiler no longer derives it from `readOnly`, so compiled nodes currently resolve it to false.
