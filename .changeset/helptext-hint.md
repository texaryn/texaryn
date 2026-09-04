---
'@texaryn/core': patch
'@texaryn/react': patch
---

Apply the `helpText` UI hint. The compiler carries it onto the field node and the default widgets render it as the field description, taking precedence over the schema `description`, with `aria-describedby` linking the input to it. `colSpan` is marked deprecated: it has never been applied and will be removed or replaced once Texaryn has a layout contract. `hidden` is documented as not applied yet.
