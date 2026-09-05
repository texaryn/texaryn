// One artifact, two applications. The documentation site owns the root and
// the playground owns /playground, so the playground build is copied into the
// docs output rather than either being merged blindly.
//
// This was shell inside the Pages workflow. It moved here when the pull
// request job started composing the site too: two copies of the compose step
// in two workflows can disagree, and a link check that runs against a
// differently composed artifact proves nothing about what deploys.
import { cpSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLAYGROUND_MOUNT } from '../site.config.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docs = resolve(root, 'apps', 'docs', 'dist')
const playground = resolve(root, 'apps', 'playground', 'dist')
const mount = resolve(docs, PLAYGROUND_MOUNT)

function requireFile(path) {
  try {
    if (statSync(path).isFile()) return
  } catch {
    // Falls through to the throw below.
  }
  throw new Error(`compose-site: ${path} is missing. Did both application builds run?`)
}

requireFile(resolve(docs, 'index.html'))
requireFile(resolve(docs, '404.html'))
requireFile(resolve(playground, 'index.html'))

rmSync(mount, { recursive: true, force: true })
cpSync(playground, mount, { recursive: true })

requireFile(resolve(mount, 'index.html'))

console.log(`compose-site: playground mounted at apps/docs/dist/${PLAYGROUND_MOUNT}`)
