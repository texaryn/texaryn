---
'@texaryn/react-mui': patch
---

`MuiSelect` no longer sets `aria-invalid` on MUI's native input. That element carries `aria-hidden="true"` and `tabindex="-1"`, so the attribute was never reachable by assistive technology. The invalid state was already correct and remains so: for a Select, MUI puts `aria-invalid` on the `role="combobox"` element from the `error` prop, and omits it entirely while valid. No rendered behaviour changes.
