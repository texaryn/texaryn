// Gives every catalog example a real entry point in the Pages build.
//
// The playground used to write a single 404.html holding the SPA, which works
// only while it owns the whole site. It does not any more: the documentation
// site owns the root, and a site-wide 404 that boots the playground would send
// a mistyped docs URL into the wrong application.
//
// The catalog is finite, so the honest answer is static files. Each id becomes
// a directory with the same entry HTML, and the app reads the path on boot as
// it already does. Generating them from the catalog means a new example gains
// a cold-loadable URL without anyone remembering to add one.
//
// This runs after `vite build`, not inside the Vite config. Importing the
// catalog's compiled output at config-load time would make `pnpm dev` depend
// on `pnpm build` having run first, breaking a fresh clone.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(here, '..', 'dist')

// The compiled output, because the package entry points at TypeScript source
// whose imports carry `.js` specifiers that Node cannot resolve directly.
const catalog = resolve(here, '..', '..', '..', 'packages', 'examples', 'dist', 'index.js')

if (!existsSync(catalog)) {
  throw new Error(
    `materialize-routes: ${catalog} does not exist. Run \`pnpm build\` before building the playground for Pages.`,
  )
}

const index = resolve(dist, 'index.html')
if (!existsSync(index)) {
  throw new Error(`materialize-routes: ${index} was not emitted. Run \`vite build\` first.`)
}

const { examples } = await import(catalog)

for (const example of examples) {
  const dir = resolve(dist, example.id)
  mkdirSync(dir, { recursive: true })
  copyFileSync(index, resolve(dir, 'index.html'))
}

console.log(`materialize-routes: wrote ${examples.length} example entry points`)
