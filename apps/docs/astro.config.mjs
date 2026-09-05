import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLinksValidator from 'starlight-links-validator'

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
      plugins: [starlightLinksValidator({ errorOnRelativeLinks: false })],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/texaryn/texaryn' },
      ],
      sidebar: [
        {
          label: 'Start',
          items: [{ label: 'What is Texaryn?', slug: 'start/what-is-texaryn' }],
        },
        {
          label: 'Concepts',
          items: [{ label: 'Architecture', slug: 'concepts/architecture' }],
        },
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
              label: 'API reference',
              link: 'https://github.com/texaryn/texaryn/tree/main/docs/api',
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
