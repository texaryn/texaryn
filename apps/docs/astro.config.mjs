import { readFileSync } from 'node:fs'
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mermaid from 'astro-mermaid'
import starlightLinksValidator from 'starlight-links-validator'
import starlightLlmsTxt from 'starlight-llms-txt'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import { BASE, BASE_PATH, PLAYGROUND_MOUNT, PLAYGROUND_PATH } from '../../site.config.mjs'

// The root typedoc.json entry points except packages/web-components.
// The root `pnpm docs` generation stays as it is: it feeds the docs:check
// release gate, and moving both systems at once would make a drift failure
// hard to attribute.
// Package directories rather than source files, with the packages entry point
// strategy, so each package is resolved through its own tsconfig. Pointing at
// a workspace-wide tsconfig instead makes TypeDoc try to compile everything,
// including test files that need JSX settings it does not have.
const API_ENTRY_POINTS = [
  '../../packages/core',
  '../../packages/angular',
  '../../packages/schema-json',
  '../../packages/schema-zod',
  '../../packages/react',
  '../../packages/react-bootstrap',
  '../../packages/react-mui',
  '../../packages/vue',
  '../../packages/svelte',
  '../../packages/solid',
]

const API_PACKAGE_NAMES = API_ENTRY_POINTS.map(
  (entryPoint) =>
    JSON.parse(readFileSync(new URL(`${entryPoint}/package.json`, import.meta.url), 'utf8')).name,
)

const analyticsScript = `(function(){if(location.hostname!=='texaryn.github.io'||location.pathname.indexOf(${JSON.stringify(PLAYGROUND_PATH)})===0)return;window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag('js',new Date());window.gtag('config','G-TH8GG8HPH6');var script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id=G-TH8GG8HPH6';document.head.appendChild(script)})()`

// The site is served from texaryn.github.io/texaryn, with the playground
// composed into the same artifact under /playground. `site` and `base` are
// what make every generated link carry the prefix.

export default defineConfig({
  site: 'https://texaryn.github.io',
  base: BASE,
  integrations: [
    // Before Starlight, so the Mermaid fences are claimed before Expressive
    // Code renders them as code blocks.
    mermaid({ autoTheme: true, enableLog: false }),
    starlight({
      title: 'Texaryn',
      logo: { src: '../../assets/logo/texaryn-mark.svg' },
      favicon: '/favicon.svg',
      // Both halves of the theme, because they have to agree on where the
      // preference lives. Overriding only the picker would leave the boot
      // script reading Starlight's key and stamping the wrong mode before the
      // picker ever runs.
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `https://texaryn.github.io${BASE_PATH}social-card.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Texaryn. Schema-driven forms. Your framework. Your design system.' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `https://texaryn.github.io${BASE_PATH}social-card.png` } },
        { tag: 'meta', attrs: { name: 'twitter:image:alt', content: 'Texaryn. Schema-driven forms. Your framework. Your design system.' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#073B63' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${BASE_PATH}apple-touch-icon.png` } },
        {
          tag: 'script',
          content: analyticsScript,
        },
        {
          // The playground materializes a real entry point for every catalog
          // example, so a valid id never reaches a 404. An id that does is
          // stale or mistyped, and the playground already handles that: fall
          // back to the first example and canonicalize the URL. Sending it to
          // the mount preserves that behaviour on a cold load.
          //
          // This sits in the global head rather than the 404 page's, because
          // the mount has to be interpolated from the shared topology rather
          // than written out again. It is safe everywhere, since the docs site
          // never serves a real page under /playground, so reaching this
          // condition means the 404 fallback already happened.
          tag: 'script',
          content: `(function(){var m=${JSON.stringify(PLAYGROUND_PATH)};if(location.pathname.indexOf(m)===0){location.replace(m+location.search)}})();`,
        },
        {
          tag: 'link',
          attrs: { rel: 'describedby', href: `${BASE_PATH}llms.txt` },
        },
      ],
      description:
        'Build schema-driven forms and display documents with a headless TypeScript runtime. Use your framework, schema adapter and design system.',
      // A broken link fails the build from the first commit. Turning this on
      // once a site already has content means starting with a backlog and
      // learning to ignore it.
      plugins: [
        starlightTypeDoc({
          entryPoints: API_ENTRY_POINTS,
          output: 'api',
          sidebar: { label: 'API reference', collapsed: true },
          typeDoc: {
            entryPointStrategy: 'packages',
            packageOptions: { readme: 'none' },
            readme: './src/api-overview.md',
            name: 'API reference',
            entryFileName: 'index',
            disableSources: true,
            excludePrivate: true,
            excludeInternal: true,
          },
        }),
        starlightLinksValidator({
          errorOnRelativeLinks: false,
          // The playground owns /playground and is composed into the artifact
          // by a separate build, so its routes do not exist in this site's
          // output. Excluding that one subtree scopes the checker to what this
          // build actually produces; every docs route stays checked.
          exclude: [PLAYGROUND_PATH.slice(0, -1), `${PLAYGROUND_PATH}**`],
        }),
        starlightLlmsTxt({
          projectName: 'Texaryn',
          description:
            'Texaryn is a framework-neutral TypeScript runtime for schema-driven forms and standalone display documents. JSON Schema, TypeBox or Zod schemas produce forms with validation and submission. Display documents render lists, tables, layouts, text and host actions without a schema adapter. Both paths support React, Angular, Vue, Svelte, SolidJS and Web Components.',
          details: [
            'Forms use version 1 UI documents and FormRuntime. Standalone display documents use version 2 and createDocumentRuntime, without a schema adapter or editable fields. These are separate document families, not successive versions of one format.',
            'Texaryn packages version independently. The first stable contract covers the root exports of `@texaryn/core`, `@texaryn/schema-json`, and `@texaryn/react`. Packages below 1.0.0 remain pre-stable and may change between minor releases. An application installs `@texaryn/core` and a schema adapter: `@texaryn/schema-json` for JSON Schema or `@texaryn/schema-zod` for Zod 4. It also installs one binding: `@texaryn/react`, `@texaryn/angular`, `@texaryn/vue`, `@texaryn/svelte`, `@texaryn/solid` or `@texaryn/web-components`. TypeBox emits JSON Schema and works with `@texaryn/schema-json`. The per-binding usage lives in each package README in the GitHub repository.',
            'The application owns the native form element for the component bindings and mountForm. Prevent its submit default and dispatch Submit. The texaryn-form custom element owns its own native form. UI hints use JSON Pointer keys. Schema defaults do not write data unless initialization is explicitly set to schema-defaults.',
            'Projection and validation support differ. Static external references use a host resolver; dynamic reference projection is opt in for supported paths. Consult the JSON Schema support guide before claiming support. Private workspace packages are not consumer dependencies.',
            '`@texaryn/react-bootstrap` and `@texaryn/react-mui` are widget registries over `@texaryn/react`, not bindings of their own. The per-binding usage lives in each package README in the GitHub repository.',
          ].join('\n\n'),
          promote: [
            'index',
            'start/getting-started',
            'start/choose-packages',
            'guides/validation-and-submission',
            'concepts/architecture',
            'guides/json-schema-support',
            'guides/ai-generation',
            'guides/display-documents',
            'guides/schema-adapters',
            'guides/migrating-from-rjsf',
          ],
          demote: ['api/**', '404'],
          exclude: ['api/**', '404'],
          customSelectors: { all: ['.sl-anchor-link'] },
          customSets: [
            {
              label: 'Getting started',
              description: 'package selection, a runnable React form, validation and submission',
              paths: ['start/getting-started', 'start/choose-packages', 'guides/validation-and-submission'],
            },
            {
              label: 'API reference',
              description: `the generated type reference for ${API_PACKAGE_NAMES.join(', ')}`,
              paths: ['api/**'],
            },
          ],
          optionalLinks: [
            {
              label: 'GitHub repository',
              url: 'https://github.com/texaryn/texaryn',
              description: 'source, package READMEs and changelogs',
            },
          ],
        }),
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/texaryn/texaryn' },
      ],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What is Texaryn?', slug: 'start/what-is-texaryn' },
            { label: 'Getting started', slug: 'start/getting-started' },
            { label: 'Choose your packages', slug: 'start/choose-packages' },
            { label: 'Roadmap', slug: 'roadmap' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Performance baseline', slug: 'concepts/performance' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Validation and submission', slug: 'guides/validation-and-submission' },
            { label: 'JSON Schema support', slug: 'guides/json-schema-support' },
            { label: 'Schema adapters', slug: 'guides/schema-adapters' },
            { label: 'Display documents', slug: 'guides/display-documents' },
            { label: 'AI generation', slug: 'guides/ai-generation' },
            {
              label: 'JSON Schema validation compatibility',
              slug: 'guides/json-schema-conformance',
            },
            { label: 'Migrating from RJSF', slug: 'guides/migrating-from-rjsf' },
            { label: 'Localizing built-in copy', slug: 'guides/localizing-built-in-copy' },
            { label: 'Custom styling', slug: 'guides/custom-styling' },
          ],
        },
        {
          label: 'Framework bindings',
          collapsed: true,
          items: [
            { label: 'React', slug: 'start/getting-started' },
            { label: 'Angular', slug: 'guides/angular' },
            { label: 'Vue', slug: 'guides/vue' },
            { label: 'Svelte', slug: 'guides/svelte' },
            { label: 'SolidJS', slug: 'guides/solid' },
            { label: 'Web Components', slug: 'guides/web-components' },
          ],
        },
        typeDocSidebarGroup,
        {
          label: 'Try it',
          items: [
            // Same artifact, different application: the playground is served
            // from this site's own base, not an external address. Starlight
            // prepends the base itself, so this must not include it.
            { label: 'Playground', link: `/${PLAYGROUND_MOUNT}/` },
            {
              label: 'GitHub',
              link: 'https://github.com/texaryn/texaryn',
              attrs: { target: '_blank' },
            },
          ],
        },
      ],
    }),
  ],
})
