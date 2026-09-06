---
'@texaryn/react': minor
'@texaryn/vue': minor
---

Give every rendering surface its own DOM id namespace, so two forms on one page no longer share ids or reference each other's elements.

`FormProvider` becomes a real component rather than an alias for `FormContext.Provider`, and owns the namespace for everything under it, `ErrorSummary` included. Rendering through `FormContext.Provider` now throws, because the context alone carries no namespace. `makeId`, `getInputProps`, `getLabelProps`, `getErrorProps` and `getDescriptionProps` take the prefix explicitly; there is no unprefixed fallback, which would let a custom widget reintroduce the collision. `@texaryn/vue` takes the prefix from `provideFormRuntime` and now requires Vue 3.5 for `useId`. Generated ids are opaque relationship identifiers rather than styling hooks.
