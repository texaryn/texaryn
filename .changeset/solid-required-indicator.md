---
"@texaryn/solid": patch
---

The required indicator now comes from `messages.requiredIndicator()` and is `aria-hidden`, as in the other renderers. A required field's accessible name is its label alone, because `aria-required` already announces the state. Custom messages can change the indicator text and place it before the label.
