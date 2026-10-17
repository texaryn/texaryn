# Public presentation review

Texaryn's public entry points should lead with schema-driven forms, then explain
framework choice, display documents and runtime contracts as readers need them.

## LLM discovery

`context7.json` describes the six bindings, schema adapters, separate document
families, private package limits and host-owned submission. The site generates
`llms.txt`, `llms-small.txt`, `llms-full.txt`, a focused getting-started text set
and an API-reference text set.
Update their source configuration in `apps/docs/astro.config.mjs`; the built
files are generated artifacts.

## Reader path

The [README](../README.md) introduces the product and provides a runnable React
example. The [homepage](../apps/docs/src/content/docs/index.mdx) offers a direct
setup path and example links. The
[package chooser](../apps/docs/src/content/docs/start/choose-packages.mdx) lists
all 12 published packages, peer versions and setup guides for six bindings.
Detailed validation, schema support and compatibility limits belong in the
guides rather than the README.

## Separate operational follow-up

The documentation and playground initialize the site's analytics script.
Analytics consent and deployment policy need a separate review; this
revision retains the existing telemetry configuration.

## Recommended website additions

1. **A short playground recording.** Show the conditional account form switching
   between personal and business fields, then switch renderer. Place it near
   the homepage example links. Keep the text links as an alternative.
2. **One real integration story.** When an adopter can provide one, explain the
   schema source, framework, design system and integration limits. Use observed
   results; do not add adoption counts, customer logos or performance claims
   without evidence.

## GitHub metadata

The [repository](https://github.com/texaryn/texaryn) describes the product as:

> Framework-neutral TypeScript runtime for schema-driven forms and display
> documents. React, Angular, Vue, Svelte, SolidJS and Web Components.

Repository topics include `angular`, `vue`, `svelte`, `solid-js`,
`web-components`, `zod` and `typebox`, alongside the form and runtime topics.
The homepage URL points to the documentation site.

Package descriptions and Zod keywords are maintained in the local package
manifests. Published npm metadata follows the release workflow; existing
versions and artifacts are not replaced.

The site's social preview is a [1200 × 630 PNG](../apps/docs/public/social-card.png)
with an [editable SVG source](../assets/social-card.svg). Keep its message
aligned with the homepage and README.
