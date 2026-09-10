---
'@texaryn/schema-json': minor
---

Provisionally selects the `oneOf` branch the current data uniquely identifies,
so a form can show the field that would make that branch apply.

`oneOf` selects on full validity, so a branch identified by an explicit
discriminator stays unselected while one of its own required properties is
absent. The branch's fields were therefore inactive, which hid the very field
needed to complete it: the exit from the state existed and the form could not
reach it. Those fields now report `provisional`, and the branch's requirements
report `provisionalRequired`, both added to the port in `@texaryn/core` 0.8.0.

The rule is narrow on purpose. Only an explicit `const` or `enum` on a property
discriminates, and only where every branch constrains that property; both
keywords together are conjunctive; the discriminator has to be present in the
data rather than declared as a `default`; every present discriminator has to
agree; and zero or several surviving branches select nothing. `type` and `anyOf`
are excluded. Nothing else about a branch participates, so a branch stays
identified when some other constraint of its own fails.

A selected branch also supplies its children's shape and annotations, ahead of
the previous first-declaration fallback, so an exposed field carries its own
branch's widget, title and `default` rather than another branch's.

One correction comes with it: `ChildProjection.required` is now gated on the
containing node applying. A branch that does not apply demands nothing, and
reporting its `required` array attributed to the validator something it was not
asking for. Previously such a child was reported required while `validate`
reported no errors.
