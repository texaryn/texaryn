---
'@texaryn/react-mui': patch
---

`MuiSelect` now sets `aria-required` on the element that exposes `role="combobox"`. It previously landed on MUI's native input, which carries `aria-hidden="true"` and `tabindex="-1"`, so assistive technology never saw the required state.
