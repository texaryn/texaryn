// @vitest-environment node
// Nothing here touches the DOM, and the alias check imports this directory's
// vite config, which pulls in esbuild. Under jsdom that throws on an esbuild
// startup invariant about TextEncoder.
import { describe, it, expect } from 'vitest'
import { lstatSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const spikeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localModules = pathToFileURL(`${spikeRoot}/node_modules/`).href

/**
 * The exercise claims to run against published packages. Everything it
 * concludes is void if it is actually running against the working tree, and
 * that failure mode is silent: Node resolution walks up the directory tree, so
 * a missing install here lands on the monorepo root's own `node_modules`,
 * which pnpm populates with symlinks into each package's source. The form
 * would render, the tests would pass, and the findings would be about
 * unreleased code.
 */
const published = {
  '@texaryn/core': '0.11.0',
  '@texaryn/react': '0.4.4',
  '@texaryn/react-mui': '0.3.4',
  '@texaryn/schema-json': '0.6.0',
} as const

/**
 * Read from the path rather than resolved as a subpath, because no `@texaryn`
 * package lists `./package.json` in its `exports`, so no resolver can reach
 * it. Recorded in the friction log; irrelevant to what this file checks, which
 * is where the code came from.
 */
function installedVersion(name: string): string {
  return JSON.parse(readFileSync(`${spikeRoot}/node_modules/${name}/package.json`, 'utf8')).version
}

/**
 * Resolution has to be measured in a real Node process. Vite's SSR transform
 * replaces `import.meta` and provides no `resolve`, and `createRequire`
 * resolution fails outright because every `@texaryn` package declares only an
 * `import` condition. Running plain Node from this directory is also the
 * stronger check: it is the resolver an adopter's toolchain would use, with
 * the conditions Node applies, rather than whatever the test bundler decided.
 */
function resolvedByNode(names: readonly string[]): Record<string, string> {
  const script = `console.log(JSON.stringify(Object.fromEntries(
    ${JSON.stringify(names)}.map((n) => [n, import.meta.resolve(n)])
  )))`
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: spikeRoot,
    encoding: 'utf8',
  })
  return JSON.parse(out)
}

describe('the packages under test are the published ones', () => {
  /**
   * The realistic way this exercise gets quietly invalidated. A walk-up to the
   * workspace cannot happen: pnpm puts its links in each package's own
   * `node_modules`, and the repository root has no `@texaryn` directory at
   * all, so a missing install here fails loudly with a resolution error.
   * What would not fail loudly is a `resolve.alias` in this directory's vitest
   * config, which is exactly what the monorepo's root config carries. That
   * would redirect every import in these tests to each package's source while
   * leaving the installed packages, their versions and Node's own resolution
   * all still correct.
   */
  it('declares no alias that could redirect an import to the working tree', async () => {
    const config = (await import('../vitest.config.js')) as {
      default: { resolve?: { alias?: unknown } }
    }
    expect(config.default.resolve?.alias).toBeUndefined()
  })

  it('every package resolves inside this directory', () => {
    const resolved = resolvedByNode(Object.keys(published))
    for (const [name, url] of Object.entries(resolved)) {
      expect(url, name).toMatch(
        new RegExp(`^${localModules.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      )
    }
  })

  it.each(Object.entries(published))('%s is installed at %s', (name, version) => {
    expect(installedVersion(name)).toBe(version)
  })

  it.each(Object.keys(published))('%s is a real directory, not a workspace link', (name) => {
    expect(lstatSync(`${spikeRoot}/node_modules/${name}`).isSymbolicLink()).toBe(false)
  })

  // The reference side has to be the RJSF that Backstage pins, not merely a
  // recent RJSF, or "preserves observable behaviour" is measured against a
  // validator no Backstage user runs.
  it('pins the RJSF versions that plugins/scaffolder-react pins', () => {
    for (const name of ['@rjsf/core', '@rjsf/utils', '@rjsf/validator-ajv8']) {
      expect(installedVersion(name), name).toBe('5.24.13')
    }
  })
})
