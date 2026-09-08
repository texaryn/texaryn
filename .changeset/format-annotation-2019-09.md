---
'@texaryn/schema-json': minor
---

Stop asserting `format` in 2019-09, where the specification makes it an annotation.

From 2019-09 the default vocabulary is format-annotation, so `format` describes a value rather than constraining it unless format-assertion is explicitly declared. 2020-12 was already handled; 2019-09 was not, so `{ "type": "string", "format": "email" }` rejected `"2962"` on a dialect where it should be valid. Draft 7 is unchanged and still asserts: that is the conventional behaviour there, and the specification asks only that it can be turned off.

This changes validation results, which is why it is a minor rather than a patch. Anyone relying on 2019-09 rejecting a malformed `format` value loses that, and the way to keep it is to declare the format-assertion vocabulary in the schema.

The old behaviour also rejected valid data, which is the more concrete argument for the change. Against the official JSON Schema Test Suite, six `optional/format/email` cases now pass that previously failed, covering quoted local parts, escaped characters and an IPv6 address literal: all legitimate addresses the underlying checker refused. The suite's 2019-09 optional pass count moves 782 to 563 in the other direction, because those cases deliberately measure an implementation that has format assertion switched on, which is no longer the default here. No mandatory result changes in any dialect.
