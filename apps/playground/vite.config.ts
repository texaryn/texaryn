import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// The compiled output, not the package entry. `@texaryn/examples` points its
// main at TypeScript source whose imports carry `.js` specifiers, which Node
// cannot resolve while loading this config outside a bundler. The workspace
// build has to run first either way, and the plugin below says so when it has
// not.
import { examples } from '../../packages/examples/dist/index.js'

// Every catalog example gets a real entry point on disk.
//
// The playground used to write a single 404.html holding the SPA, which works
// only while it owns the whole site. It does not any more: the documentation
// site owns the root, and a site-wide 404 that boots the playground would send
// a mistyped docs URL into the wrong application.
//
// The catalog is finite, so the honest answer is static files. Each example id
// becomes a directory with the same entry HTML, and the app reads the path on
// boot exactly as it already does. Generating them from the catalog means a
// new example gains a cold-loadable URL without anyone remembering to add one.
function materializeExampleRoutes() {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'materialize-example-routes',
    configResolved(config: { build: { outDir: string }; root: string }) {
      outDir = config.build.outDir
      root = config.root
    },
    closeBundle() {
      const dist = resolve(root, outDir)
      const index = resolve(dist, 'index.html')
      if (!existsSync(index)) {
        throw new Error(
          `materialize-example-routes: ${index} was not emitted. Run \`pnpm build\` before building the playground.`,
        )
      }

      for (const example of examples) {
        const dir = resolve(dist, example.id)
        mkdirSync(dir, { recursive: true })
        copyFileSync(index, resolve(dir, 'index.html'))
      }
    },
  }
}

// The mount point, not the site root. Pages overrides this with
// --base=/texaryn/playground/ so the docs site can own everything above it.
export default defineConfig({
  base: '/playground/',
  plugins: [react(), materializeExampleRoutes()],
})
