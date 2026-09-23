# ADR-006: RJSF's uiSchema Is Converted, Not Adopted

## Status

Accepted. `@texaryn/hints-rjsf` converts a JSON-serializable RJSF 5.24.13 uiSchema, with Backstage Software Templates as the primary source, and stays private until a release PR makes it public.

## Context

The Backstage adoption exercise found that template authors write presentation in RJSF's uiSchema: `ui:field` in 72% of public template files, `ui:options` in 68%, `ui:autofocus` in 41%. Texaryn's own hints are a flat map keyed by data pointer with a small vocabulary, and the only widget value any rendering family dispatches on is `textarea`. The roadmap rule is to leave RJSF's vocabulary out of Texaryn and offer a documented layer between the two instead.

## Decision

A conversion outside core reads a uiSchema against the port's `SchemaProjection` and produces three things: `UIHints` for what has a Texaryn destination, a list of the host components the uiSchema names, and an issue for every difference from what RJSF 5.24.13 renders. Nothing is guessed and nothing is dropped silently.

- **The projection decides.** Node kind and child membership come from the port, so the conversion never disagrees with what core compiles, and it works over any port.
- **Fidelity.** The conversion reproduces RJSF's effective presentation, defaults included, wherever Texaryn has the concept. Every statically addressable array gets `canReorder: true` unless RJSF's effective `orderable` is false.
- **Components are requirements, not losses.** `ui:field`, and a `ui:widget` Texaryn does not render itself, become a `ComponentRequirement`. `componentTester` routes them in all five families through the core `WidgetTester`, and `uiSchemaAt` hands the component RJSF's options and subtree. A component owns its subtree, as in RJSF.
- **Six issue codes.** `unsupported`, `conflict`, `conditional`, `unaddressable`, `unknown-location`, `invalid-value`. The code is the contract; the message is not.
- **Global options.** Only the seven keys RJSF types as global form the base under every location; any other key in `ui:globalOptions` is reported once, since RJSF applies it at some call sites only.
- **Static addressing.** A value RJSF picks by the selected `oneOf` or `anyOf` option is `conditional`, and a hint for every row is `unaddressable`, because Texaryn hints address one data location.
- **Backstage's embedded form.** `splitBackstageStep` applies Backstage's `extractSchemaFromStep` rules, records where each key was written, and lifts schema-level `enumNames` so the conversion reports it.

## Alternatives rejected

- **Extending core so more carries**: item-template hints, `widget` on containers, an options bag. Each is a contract of its own, and a migration tool should not settle three of them. The measured frequency of the first two is 2 and 7 keys in 1299.
- **A Texaryn UI schema that mirrors RJSF's nesting.** It copies the vocabulary the roadmap ruled out and adds a second addressing scheme beside pointers.
- **Hosting it in core**, which would put RJSF's name in core's API, or in `@texaryn/schema-json`, which is one evaluator while the conversion reads any port's projection.
- **The raw schema as input.** A second schema reader disagrees with the ports on type arrays, typeless shapes and branch properties, and reports valid keys as unknown.
- **Component names in `hints.widget`.** It copies RJSF's widget names into core's widget namespace, and a component still needs its options through a second channel.
- **`hidden` as a widget.** In RJSF it is visibility, and Texaryn has no visibility contract.
- **The options bag as a Texaryn contract.** `uiSchemaAt(pointer).options` is RJSF's shape for components shaped after RJSF, and a future core options channel is not bound to it.
- **Composing help and description into one text.** It rewrites what the author wrote; help beside a description is a `conflict`.
- **Recovering an invalid `ui:order`.** RJSF renders a configuration error there, so the conversion writes no order and reports it.

## Consequences

- An adopter sees exactly what a migration costs: a list of components to register and a list of differences with a path into the uiSchema, or into the step when `splitBackstageStep` produced it.
- The reported gaps are the evidence for later decisions: enum labels first (17% of templates), then item templates and container descriptions.
- RJSF v6 is not the reference. Its function form of `uiSchema.items`, layout grid, map-form `ui:enumNames` and `ui:enumOrder` fall outside the profile.
