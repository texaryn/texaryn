---
'@texaryn/react': minor
'@texaryn/react-bootstrap': minor
'@texaryn/react-mui': minor
'@texaryn/vue': minor
---

Expose a titled nested object as a named group in React and Vue, closing the last gap the DOM accessibility contract declared.

A nested object rendered as a plain `div` gives no indication where one group of fields ends and the next begins. It is now a `fieldset` named by its `legend`, matching what `@texaryn/web-components` already did. The element is chosen once at mount and only the grouping semantics are re-derived, because a conditional subschema can add or drop a title on any recompile and swapping `div` for `fieldset` at that moment would remount the subtree and take the caret with it. An untitled nested object stays a `fieldset` but carries `role="none"`, since an unnamed group is noise in the accessibility tree.

The decision is shared through a new `useObjectGroup` hook, so the three React widget sets cannot drift apart on it. The root object is still a plain container: it is the form itself, not a group inside one.
