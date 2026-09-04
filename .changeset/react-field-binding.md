---
'@texaryn/react': minor
---

Add `useFieldBinding(node)`, the composition layer for custom widgets: semantic value and `setValue`, label, description, placeholder, display-gated errors, ARIA prop getters, and two event-shaped DOM adapters, `domInputProps` for text, number, textarea and select controls and `domCheckboxProps` for checkboxes, which own display value and coercion. The default field widgets are rebuilt on it with unchanged behaviour.
