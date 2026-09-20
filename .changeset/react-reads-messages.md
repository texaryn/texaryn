---
'@texaryn/react': minor
---

`FormProvider` takes `messages`, a whole `FormMessages` set, and every built-in
widget renders from it. `useFormMessages()` is how a custom widget reads it.

Removed: `removeActionName`, `moveUpActionName`, `addActionName` and
`REQUIRED_INDICATOR`. Their purpose was letting a custom widget match the
built-in wording, and a function that returns English whatever is configured
now serves that purpose wrongly, leaving one widget in English while the form
translates. Migration:

before

    removeActionName(position, itemTitle, arrayTitle)
    <span aria-hidden="true"> {REQUIRED_INDICATOR}</span>

after

    const messages = useFormMessages()
    messages.removeItem({ position, itemTitle, containerTitle: arrayTitle }).accessibleName
    messages.requiredIndicator()   // { text, placement }

`ArrayActions` returns an `ActionMessage` per action, `add` and `remove(position, item)`,
carrying `label` and `accessibleName` together.
