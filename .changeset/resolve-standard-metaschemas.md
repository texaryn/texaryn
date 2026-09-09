---
'@texaryn/schema-json': minor
---

Resolve the published JSON Schema metaschemas, so a schema can assert that it is itself a valid schema.

A schema may reference its dialect's metaschema by canonical URI, which is how the specification's own test suite checks schema validity. `json-schema-library` carries the draft definitions but not the metaschema documents, and an unresolved reference fails closed, so previously a perfectly valid schema was reported invalid with `Could not resolve $ref`. Draft 7, 2019-09 and 2020-12 all work now, including the vocabulary documents the later two reference.

The documents are vendored, so nothing is fetched over the network, and they are loaded on demand: a form that never asks the question does not carry them. Loading is keyed on `$ref`, `$dynamicRef` and `$recursiveRef`, never on `$schema`, because every schema declares one of those and the validator maps it to a draft without retrieving anything. The dialect comes from the URI that was referenced rather than the one detected, so a Draft 7 schema referencing the 2020-12 metaschema gets the right closure.

One inherited consequence is worth knowing: metaschema validation follows the dialect's `format` rule, so a malformed `pattern` or `$id` is rejected under Draft 7, which asserts `format`, and not under 2019-09 or 2020-12, which treat it as an annotation. Strict schema linting would be a separate capability rather than a change to validation semantics.

Against the official test suite this closes all six standard-metaschema failures, taking mandatory results to 917/929 for Draft 7, 1244/1261 for 2019-09 and 1278/1301 for 2020-12, with no other result moving in either adapter.
