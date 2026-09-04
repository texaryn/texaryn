# @texaryn/examples

The executable capability catalog. Private to the workspace and never published.

Examples are data: a schema, optional initial data, optional hints, and the
capabilities they demonstrate. They carry no renderer UI, so the same fixture
drives the playground, the documentation, the tests and any future framework
renderer without being rewritten for each.

## What the manifest means

`capabilities.ts` is the source of truth for what Texaryn **claims and
demonstrates**. It is deliberately not a list of everything the runtime
happens to accept.

A capability being absent means it is **not yet catalogued**, not that it is
unsupported. `@texaryn/schema-json` already handles more than the manifest
currently declares, including references, conditionals, composition,
dependencies and three dialects. Those entries arrive with the examples that
demonstrate them, which is what keeps the coverage check honest: declaring a
capability with no example fails the build, so the manifest can never claim
more than the catalog proves.

Read the manifest as a floor, never a ceiling. Once the catalog is complete
the distinction stops mattering, but until then, absence is a statement about
this package rather than about Texaryn.

Only public Texaryn capabilities belong here. How a particular renderer
implements one is renderer conformance: `accessibility.required` belongs,
`mui-select-aria-required` does not.

## Where a capability is proven

Every entry declares a `verification` layer: `projection`, `runtime` or
`renderer`. It records where the semantic proof belongs, and it names a layer
rather than a suite on purpose, since naming a suite would tie the public
catalog to test file names.

This keeps two different guarantees apart. Example coverage answers "can
someone select this capability in the docs or playground". The semantic proof
answers "does Texaryn implement it correctly". Conflating them is what would
push renderer concerns into this renderer-neutral package.

Accessibility is the case that makes the distinction earn its keep. Those
capabilities are proven at the `renderer` layer by the shared conformance
suites across Default, Bootstrap and Material UI, while their examples stay
plain data here. They are never exempt from needing an example: picking
"Required semantics" and switching renderer while the same schema renders is
among the most useful things the playground will offer.

An example that deliberately starts in a state its own schema rejects sets
`startsInvalid: true`, which is how a validation or error example shows
anything. Tests then require those errors rather than tolerating them, so an
accidental violation is still caught.

## Adding a capability

A capability and the example that demonstrates it land together:

1. Add the manifest entry.
2. Add a focused example whose `covers` names it, with its own small schema
   rather than an addition to a larger one.
3. Give it `initialData` that satisfies its own schema.
4. Assert the capability actually changed the projection or runtime
   behaviour. That a document projected at all is a weak claim for anything
   conditional or compositional.

Identifiers are namespaced as `domain.category.capability`, with further
segments where they help, and JSON Schema keywords keep their official
casing: `schema.type.string`, `schema.composition.oneOf`,
`schema.conditional.if-then-else`, `validation.trigger.blur`.

## Coverage is enforced in both directions

The two directions need different mechanisms:

- **An example covering an unknown capability is a compile error.**
  `CapabilityId` derives from the manifest, so a typo fails typecheck with a
  suggestion. A runtime assertion repeats the check for anything that reaches
  the registry another way.
- **A capability with no example fails a test.** This one cannot be expressed
  in the type system, because the type system cannot count.

A supported capability requires an example. Opting out needs
`exampleRequired: false` together with a written `exampleExemptionReason`, so
a genuinely non-demoable capability has to justify itself and whole
categories cannot drift out of coverage quietly.
