---
'@texaryn/vue': minor
---

`provideFormRuntime(runtime, { messages })` takes a whole `FormMessages` set as
a value, a ref or a getter, and every built-in widget renders from it.
`useFormMessages()` returns it as a computed for a custom widget, and
`FieldWidget` carries it as `messages`.

Removed: `removeActionName`, `moveUpActionName` and `addActionName`, for the
reason given for the React binding: a helper that ignores the configuration
leaves one widget in English while the form translates. Migration:

before

    removeActionName(position, itemTitle, arrayTitle)

after

    const messages = useFormMessages()
    messages.value.removeItem({ position, itemTitle, containerTitle: arrayTitle }).accessibleName
