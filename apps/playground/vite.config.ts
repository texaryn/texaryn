import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { transformAsync } from '@babel/core'
import linkerPlugin from '@angular/compiler-cli/linker/babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { PLAYGROUND_PATH } from '../../site.config.mjs'
import { themeBootScript } from '../../theme.config.mjs'

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

interface ChunkContext {
  getModuleIds(): IterableIterator<string>
  getModuleInfo(id: string): {
    importers: readonly string[]
    dynamicImporters: readonly string[]
    importedIds: readonly string[]
  } | null
}

function lazyGroup(id: string): 'editor' | 'palette' | undefined {
  const file = id.replaceAll('\\', '/')
  if (/\/node_modules\/(@codemirror|@lezer|crelt|style-mod|w3c-keyname)\//.test(file) || file.includes('/apps/playground/src/editor/')) {
    return 'editor'
  }
  if (/\/node_modules\/(cmdk|@radix-ui)\//.test(file) || file.includes('/apps/playground/src/palette/')) {
    return 'palette'
  }
  return undefined
}

// Rollup pulls every static dependency of a manual chunk into that chunk, so a
// dependency the first load also imports (React, schema-json) would turn the
// lazy chunk eager. Modules a lazy group reaches and outsiders import are 'shared'.
function sharedModules({ getModuleIds, getModuleInfo }: ChunkContext): Set<string> {
  const pulled = new Set<string>()
  const visit = (id: string) => {
    for (const dep of getModuleInfo(id)?.importedIds ?? []) {
      if (lazyGroup(dep) || pulled.has(dep)) continue
      pulled.add(dep)
      visit(dep)
    }
  }
  for (const id of getModuleIds()) if (lazyGroup(id)) visit(id)

  const exclusive = new Set(pulled)
  for (let changed = true; changed;) {
    changed = false
    for (const id of exclusive) {
      const info = getModuleInfo(id)
      const importers = [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])]
      if (importers.every((importer) => lazyGroup(importer) || exclusive.has(importer))) continue
      exclusive.delete(id)
      changed = true
    }
  }
  return new Set([...pulled].filter((id) => !exclusive.has(id)))
}

let shared: { owner: ChunkContext['getModuleInfo']; ids: Set<string> } | undefined

function manualChunks(id: string, context: ChunkContext): string | undefined {
  const group = lazyGroup(id)
  if (group) return group
  if (shared?.owner !== context.getModuleInfo) shared = { owner: context.getModuleInfo, ids: sharedModules(context) }
  return shared.ids.has(id) ? 'shared' : undefined
}

export default defineConfig(({ mode }) => ({
  base: baseForMode(mode),
  resolve: mode === 'benchmark' ? { mainFields: ['module'] } : undefined,
  define: mode === 'benchmark' ? { ngDevMode: 'false' } : undefined,
  plugins: [
    ...(mode === 'benchmark' ? [angularPartialLinker()] : []),
    themeBoot(),
    tailwindcss(),
    svelte(),
    react(),
  ],
  build: {
    manifest: true,
    rollupOptions: { output: { manualChunks } },
  },
}))
