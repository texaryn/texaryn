import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { transformAsync } from '@babel/core'
import linkerPlugin from '@angular/compiler-cli/linker/babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { BASE_PATH, PLAYGROUND_PATH } from '../../site.config.mjs'
import { themeBootScript } from '../../theme.config.mjs'
import { manualChunks } from './src/chunking'

// The theme has to be on the document before the first paint, which means an
// inline script in the head rather than anything the application bundle can
// do. Injecting it here keeps `index.html` free of a hand written copy of the
// storage key and the resolution rule: the documentation site's own boot
// script is generated from the same function.
function themeBoot(): Plugin {
  return {
    name: 'texaryn-theme-boot',
    transformIndexHtml() {
      return [{ tag: 'script', children: themeBootScript(), injectTo: 'head-prepend' }]
    },
  }
}

function playgroundMetadata(): Plugin {
  const pageUrl = `https://texaryn.github.io${PLAYGROUND_PATH}`
  const imageUrl = `https://texaryn.github.io${BASE_PATH}social-card.png`
  return {
    name: 'texaryn-playground-metadata',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: pageUrl } },
        { tag: 'link', attrs: { rel: 'icon', href: `${BASE_PATH}favicon.svg`, type: 'image/svg+xml' } },
        { tag: 'meta', attrs: { property: 'og:title', content: 'Texaryn Playground: schema-driven forms' } },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        { tag: 'meta', attrs: { property: 'og:url', content: pageUrl } },
        { tag: 'meta', attrs: { property: 'og:description', content: 'Edit schemas and data, explore conditional fields and arrays, and compare framework bindings and design systems.' } },
        { tag: 'meta', attrs: { property: 'og:image', content: imageUrl } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Texaryn. Schema-driven forms. Your framework. Your design system.' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: imageUrl } },
        { tag: 'meta', attrs: { name: 'twitter:image:alt', content: 'Texaryn. Schema-driven forms. Your framework. Your design system.' } },
      ]
    },
  }
}

function angularPartialLinker(): Plugin {
  return {
    name: 'texaryn-angular-partial-linker',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.replaceAll('\\', '/').split('?')[0]
      const isAngularPackage = /(?:\/packages\/angular|\/node_modules\/@texaryn\/angular)\/dist\//.test(file)
        || /\/node_modules\/@angular\/.*\.m?js$/.test(file)
      if (!isAngularPackage || !code.includes('ɵɵngDeclare')) return null

      const result = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        plugins: [linkerPlugin],
      })
      if (!result?.code) throw new Error(`Angular linker returned no output for ${file}.`)
      return { code: result.code, map: result.map ?? null }
    },
  }
}

// Two mounts, because the application runs in two topologies. On its own it
// owns the site root and sits at /playground/; in the Pages artifact the
// documentation site owns the root and this moves under the site base.
//
// The Pages value comes from the shared topology rather than a --base literal
// in package.json. That literal was the last copy of the site base outside
// site.config.mjs, and the quietest: the composed link check reads anchors,
// so a playground built against a stale base would pass every check and then
// fail to load its own assets.
//
// Nothing here adds a dependency on generated output. Materializing an entry
// point per catalog example is a Pages-build concern and lives in
// scripts/materialize-routes.mjs, so loading this config never needs a build
// to have run.
//
// The workspace prerequisite still applies: the internal packages resolve
// through their compiled dist, so `pnpm build` has to run before the dev
// server can resolve them.
function baseForMode(mode: string): string {
  if (mode === 'pages') return PLAYGROUND_PATH
  if (mode === 'benchmark') return '/'
  return '/playground/'
}

export default defineConfig(({ mode }) => ({
  base: baseForMode(mode),
  resolve: mode === 'benchmark' ? { mainFields: ['module'] } : undefined,
  define: mode === 'benchmark' ? { ngDevMode: 'false' } : undefined,
  plugins: [
    ...(mode === 'benchmark' ? [angularPartialLinker()] : []),
    themeBoot(),
    ...(mode === 'pages' ? [playgroundMetadata()] : []),
    tailwindcss(),
    svelte(),
    react(),
  ],
  build: {
    manifest: true,
    rollupOptions: { output: { manualChunks } },
  },
}))
