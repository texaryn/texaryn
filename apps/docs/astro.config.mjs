import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLinksValidator from 'starlight-links-validator'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'

// The five published packages, matching the root typedoc.json entry points.
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
]

// The site is destined for texaryn.github.io/texaryn. Setting site and base
// now means every generated link is already correct, rather than the whole
// navigation needing rework when the deployment lands.
//
// Nothing here is deployed yet. The playground keeps the Pages artifact, and
// combining the two is its own change.
export default defineConfig({
  site: 'https://texaryn.github.io',
  base: '/texaryn',
  integrations: [
    starlight({
      title: 'Texaryn',
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
        starlightLinksValidator({ errorOnRelativeLinks: false }),
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
        // Placeholders for the surfaces this site will eventually own. They
        // point at where each thing lives today rather than at pages that do
        // not exist, so the link checker stays meaningful.
        {
          label: 'Elsewhere for now',
          items: [
            {
              label: 'Playground',
              link: 'https://texaryn.github.io/texaryn/',
              attrs: { target: '_blank' },
            },
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
