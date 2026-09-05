import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLinksValidator from 'starlight-links-validator'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import { BASE, PLAYGROUND_MOUNT, PLAYGROUND_PATH } from '../../site.config.mjs'

// The published packages, matching the root typedoc.json entry points.
// The root `pnpm docs` generation stays as it is: it feeds the docs:check
// release gate, and moving both systems at once would make a drift failure
// hard to attribute.
// Package directories rather than source files, with the packages entry point
// strategy, so each package is resolved through its own tsconfig. Pointing at
// a workspace-wide tsconfig instead makes TypeDoc try to compile everything,
// including test files that need JSX settings it does not have.
const API_ENTRY_POINTS = [
  '../../packages/core',
  '../../packages/schema-json',
  '../../packages/react',
  '../../packages/react-bootstrap',
  '../../packages/react-mui',
  '../../packages/vue',
]

// The site is served from texaryn.github.io/texaryn, with the playground
// composed into the same artifact under /playground. `site` and `base` are
// what make every generated link carry the prefix.

export default defineConfig({
  site: 'https://texaryn.github.io',
  base: BASE,
  integrations: [
    starlight({
      title: 'Texaryn',
      // Both halves of the theme, because they have to agree on where the
      // preference lives. Overriding only the picker would leave the boot
      // script reading Starlight's key and stamping the wrong mode before the
      // picker ever runs.
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      head: [
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
      ],
      description:
        'A framework-neutral runtime for schema-driven interfaces. JSON Schema in, any renderer out.',
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
            // No package README pages: those stay package-local quick
            // references rather than becoming a second copy on the site. The
            // generated index would otherwise link to pages that do not
            // exist, so the index is authored instead.
            packageOptions: { readme: 'none' },
            readme: 'none',
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
          ],
        },
        {
          label: 'Concepts',
          items: [{ label: 'Architecture', slug: 'concepts/architecture' }],
        },
        {
          label: 'Guides',
          items: [{ label: 'Migrating from RJSF', slug: 'guides/migrating-from-rjsf' }],
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
