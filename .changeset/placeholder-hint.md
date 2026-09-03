---
'@texaryn/core': patch
'@texaryn/react': patch
---

Apply the `placeholder` UI hint. The compiler now carries it onto the field node and `getInputProps` emits it, so text, number and textarea widgets render the placeholder that the hint has documented since the first alpha.
