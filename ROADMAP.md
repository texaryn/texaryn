# Texaryn: Product Roadmap

Updated: 13 October 2026

Texaryn is a framework-neutral TypeScript toolkit for schema-driven forms and standalone display documents. It turns JSON Schema into forms that can render in React, Angular, Vue, Svelte, SolidJS, or Web Components. Display documents present lists, tables, layouts, text, and actions handled by the application that uses Texaryn.

## Current status

**The first stable release is published.** The stable compatibility contract covers three packages, all at 1.0.0:

1. [`@texaryn/core`](https://www.npmjs.com/package/@texaryn/core) provides document compilation, runtimes, and rendering infrastructure.
2. [`@texaryn/schema-json`](https://www.npmjs.com/package/@texaryn/schema-json) evaluates and validates JSON Schema.
3. [`@texaryn/react`](https://www.npmjs.com/package/@texaryn/react) provides React bindings, a renderer, and default widgets.

Nine other published packages provide optional framework, UI library, schema, and collaboration integrations. Each follows its own version. Packages below 1.0.0 remain pre-stable and may introduce breaking changes in minor releases. See the [package catalog](https://github.com/texaryn/texaryn#packages) for live npm versions and package purposes.

The stable release covers the three named package contracts. The other integrations are not part of the stable cohort.

## What is available

**Forms and validation.** JSON Schema Draft 4, Draft 7, 2019-09, and 2020-12 are supported. Forms render through React, Angular, Vue, Svelte, SolidJS, and Web Components. Each renderer family has default widgets. React also has optional Bootstrap 5 and Material UI v9 widgets.

**Display documents.** Lists, tables, layouts, text, and actions handled by the application work without a form schema. Applications can update display documents as server data changes.

**Playground.** The visual form builder edits common field properties. The JSON editor remains available for advanced schemas.

**AI generation.** A versioned output format and examples help external models generate forms and display documents. Texaryn does not include an AI service or SDK.

**Array controls and collaboration.** Native drag and drop reorder includes accessible Up and Down controls. The optional Yjs integration supports shared scalar field edits.

These capabilities have shipped. Compatibility follows each package's version and support policy.

## What happens next

The first stable release is complete. No post-release feature milestone or delivery date is committed. Follow-up work depends on concrete integration needs, adoption feedback, and supported workload measurements.

Some work remains deferred until there is evidence to support it. A shared plugin API needs two independent integrations with the same unmet need. Schema projection changes need an integration that requires semantics the current boundary cannot represent. Document migration code waits until a breaking change within one document family is scheduled. Targeted diffing waits for a supported workload that exceeds its interaction latency target. No additional UI library package is scheduled.

These are conditions for reconsidering work, not promised deliverables.

## Where to start

1. [Try the playground](https://texaryn.github.io/texaryn/playground/).
2. [Follow the getting started guide](https://texaryn.github.io/texaryn/start/getting-started/).
3. [Browse packages and current npm versions](https://github.com/texaryn/texaryn#packages).
4. [View GitHub releases](https://github.com/texaryn/texaryn/releases).
5. [Report an issue or contribute](https://github.com/texaryn/texaryn/issues).

Read the [architecture overview](https://texaryn.github.io/texaryn/concepts/architecture/) for the current system design. The detailed research, decisions, and completed milestone record are preserved in the [engineering roadmap archive](https://github.com/texaryn/texaryn/blob/main/ROADMAP-ENGINEERING-ARCHIVE.md).
