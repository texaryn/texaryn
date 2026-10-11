import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, posix } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import solid from 'vite-plugin-solid'
import { build } from 'vite'
import { publishedPackages } from './packages.mjs'

const packages = publishedPackages

const requiredFiles = [
  'package/dist/index.js',
  'package/dist/index.d.ts',
  'package/README.md',
  'package/CHANGELOG.md',
  'package/LICENSE',
  'package/package.json',
]

const forbiddenPatterns = [/^package\/src\//, /\.test\./, /\.spec\./, /tsconfig/]

let failed = false

for (const pkg of packages) {
  console.log(`\n=== ${pkg.name} ===\n`)

  const tmp = mkdtempSync(join(process.cwd(), pkg.dir, '.verify-'))
  let isolatedConsumerDir
  let solidDom
  let solidDomGlobalDescriptors
  try {
    execSync(`pnpm pack --pack-destination ${tmp}`, {
      cwd: pkg.dir,
      stdio: 'pipe',
    })

    const tarballs = readdirSync(tmp).filter((f) => f.endsWith('.tgz'))
    if (tarballs.length !== 1) {
      console.error(`Expected 1 tarball, found ${tarballs.length}`)
      failed = true
      continue
    }
    const tarball = join(tmp, tarballs[0])

    const listing = execSync(`tar tzf ${tarball}`, { encoding: 'utf8' })
    const files = listing.trim().split('\n')

    for (const required of requiredFiles) {
      if (!files.includes(required)) {
        console.error(`MISSING: ${required}`)
        failed = true
      } else {
        console.log(`  ok: ${required}`)
      }
    }

    // Every package versions independently, so an internal dependency has to
    // publish as a caret range. An exact pin silently restores lockstep.
    const manifest = JSON.parse(execSync(`tar xzf ${tarball} -O package/package.json`, { encoding: 'utf8' }))
    if (pkg.name === '@texaryn/schema-json') {
      const vendoredFiles = [
        'package/dist/vendor/json-schema-library/index.mjs',
        'package/dist/vendor/json-schema-library/index.mjs.map',
        'package/dist/vendor/json-schema-library/LICENSE.md',
      ]
      for (const file of vendoredFiles) {
        if (!files.includes(file)) {
          console.error(`MISSING: ${file}`)
          failed = true
        }
      }

      const adapter = execSync(`tar xzf ${tarball} -O package/dist/adapter.js`, { encoding: 'utf8' })
      if (!adapter.includes('./vendor/json-schema-library/index.mjs')) {
        console.error('schema-json runtime does not use its vendored json-schema-library')
        failed = true
      }

      const vendoredRuntime = execSync(
        `tar xzf ${tarball} -O package/dist/vendor/json-schema-library/index.mjs`,
        { encoding: 'utf8' },
      )
      const runtimeBase = 'package/dist/vendor/json-schema-library'
      const runtimeImports = [...vendoredRuntime.matchAll(/(?:\bfrom\s*|\bimport\s*\()(["'])(\.\.?\/[^"']+\.mjs)\1/g)]
      for (const [, , specifier] of runtimeImports) {
        const file = posix.join(runtimeBase, specifier)
        if (!files.includes(file)) {
          console.error(`MISSING: ${file}`)
          failed = true
        }
      }
      if (!vendoredRuntime.includes('if(!d)return f;')) {
        console.error('schema-json vendor is missing the dependent schema reduction fix')
        failed = true
      }
    }

    for (const field of ['dependencies', 'peerDependencies']) {
      for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
        if (!dep.startsWith('@texaryn/')) continue
        if (typeof range !== 'string' || !range.startsWith('^')) {
          console.error(`${field}.${dep} should be a caret range, got ${range}`)
          failed = true
        }
      }
    }

    for (const file of files) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(file)) {
          console.error(`FORBIDDEN: ${file} matches ${pattern}`)
          failed = true
        }
      }
    }

    console.log(`\n  publint:`)
    try {
      execSync(`npx publint ${tarball}`, { stdio: 'inherit' })
    } catch {
      console.error(`publint failed for ${pkg.name}`)
      failed = true
    }

    console.log(`\n  attw:`)
    try {
      const command = pkg.name === '@texaryn/svelte'
        ? `npx attw ${tarball} --profile esm-only --ignore-rules internal-resolution-error no-resolution`
        : `npx attw --profile esm-only ${tarball}`
      execSync(command, { stdio: 'inherit' })
    } catch {
      console.error(`attw failed for ${pkg.name}`)
      failed = true
    }

    console.log(`\n  import smoke test:`)
    const extractDir =
      pkg.name === '@texaryn/schema-json'
        ? (isolatedConsumerDir = mkdtempSync(join(tmpdir(), 'texaryn-schema-json-consumer-')))
        : join(tmp, 'extracted')
    execSync(`mkdir -p ${extractDir} && tar xzf ${tarball} -C ${extractDir}`)
    if (pkg.name === '@texaryn/schema-json') {
      const isolatedNodeModules = join(extractDir, 'node_modules')
      const runtimeDependencies = [
        '@sagold/json-pointer',
        'fast-copy',
        'fast-deep-equal',
        'valid-url',
      ]
      for (const dependency of runtimeDependencies) {
        const source = join(process.cwd(), pkg.dir, 'node_modules', dependency)
        const target = join(isolatedNodeModules, dependency)
        if (!existsSync(source)) {
          console.error(`MISSING workspace runtime dependency: ${dependency}`)
          failed = true
          continue
        }
        mkdirSync(dirname(target), { recursive: true })
        symlinkSync(source, target, 'dir')
      }
      const texarynScope = join(isolatedNodeModules, '@texaryn')
      mkdirSync(texarynScope, { recursive: true })
      symlinkSync(join(process.cwd(), 'packages/core'), join(texarynScope, 'core'), 'dir')
      if (existsSync(join(isolatedNodeModules, 'json-schema-library'))) {
        console.error('schema-json packed consumer smoke must not resolve json-schema-library from the workspace')
        failed = true
      }
    }
    if (pkg.name === '@texaryn/angular') {
      const isolatedNodeModules = join(extractDir, 'node_modules')
      for (const dependency of ['@angular/common', '@angular/compiler', '@angular/core']) {
        const source = join(process.cwd(), pkg.dir, 'node_modules', dependency)
        const target = join(isolatedNodeModules, dependency)
        if (!existsSync(source)) {
          console.error(`MISSING workspace peer dependency: ${dependency}`)
          failed = true
          continue
        }
        mkdirSync(dirname(target), { recursive: true })
        symlinkSync(source, target, 'dir')
      }
      const texarynScope = join(isolatedNodeModules, '@texaryn')
      mkdirSync(texarynScope, { recursive: true })
      symlinkSync(join(process.cwd(), 'packages/core'), join(texarynScope, 'core'), 'dir')
    }
    if (pkg.name === '@texaryn/svelte') {
      const isolatedNodeModules = join(extractDir, 'node_modules')
      const texarynScope = join(isolatedNodeModules, '@texaryn')
      mkdirSync(texarynScope, { recursive: true })
      symlinkSync(join(process.cwd(), 'packages/core'), join(texarynScope, 'core'), 'dir')
      symlinkSync(
        join(process.cwd(), pkg.dir, 'node_modules', 'svelte'),
        join(isolatedNodeModules, 'svelte'),
        'dir',
      )
    }
    if (pkg.name === '@texaryn/solid') {
      const isolatedNodeModules = join(extractDir, 'node_modules')
      const texarynScope = join(isolatedNodeModules, '@texaryn')
      mkdirSync(texarynScope, { recursive: true })
      symlinkSync(join(process.cwd(), 'packages/core'), join(texarynScope, 'core'), 'dir')
      symlinkSync(
        join(process.cwd(), pkg.dir, 'node_modules', 'solid-js'),
        join(isolatedNodeModules, 'solid-js'),
        'dir',
      )
    }
    if (pkg.name === '@texaryn/collaboration-yjs') {
      const isolatedNodeModules = join(extractDir, 'node_modules')
      const texarynScope = join(isolatedNodeModules, '@texaryn')
      mkdirSync(texarynScope, { recursive: true })
      symlinkSync(join(process.cwd(), 'packages/core'), join(texarynScope, 'core'), 'dir')
      symlinkSync(
        join(process.cwd(), pkg.dir, 'node_modules', 'yjs'),
        join(isolatedNodeModules, 'yjs'),
        'dir',
      )
    }
    try {
      let mod
      if (pkg.name === '@texaryn/angular') {
        // The package is partially compiled. The plain Node smoke test uses
        // Angular's JIT fallback, while application builds use the linker.
        const consumerRequire = createRequire(join(extractDir, 'package', 'package.json'))
        await import(pathToFileURL(consumerRequire.resolve('@angular/compiler')).href)
      }
      if (pkg.name === '@texaryn/svelte') {
        // Svelte packages ship component source for the consuming Svelte
        // compiler. Bundle the unpacked tarball through that compiler before
        // importing it, because Node cannot import .svelte files directly.
        const entry = join(extractDir, 'consumer.js')
        writeFileSync(join(extractDir, 'package.json'), JSON.stringify({ type: 'module' }))
        writeFileSync(
          entry,
          "import { bindFormRuntime, createForm, createDefaultRegistry, FormRoot } from './package/dist/index.js'; export { bindFormRuntime, createForm, createDefaultRegistry, FormRoot }",
        )
        await build({
          configFile: false,
          root: extractDir,
          plugins: [svelte({ configFile: join(process.cwd(), pkg.dir, 'svelte.config.js') })],
          resolve: { conditions: ['svelte', 'browser'] },
          build: {
            lib: { entry, formats: ['es'], fileName: 'consumer' },
            outDir: 'consumer-dist',
            rollupOptions: { external: ['@texaryn/core', 'svelte', 'svelte/store'] },
          },
        })
        mod = await import(pathToFileURL(join(extractDir, 'consumer-dist', 'consumer.js')).href)
      } else if (pkg.name === '@texaryn/solid') {
        const entry = join(extractDir, 'consumer.js')
        writeFileSync(join(extractDir, 'package.json'), JSON.stringify({ type: 'module' }))
        writeFileSync(
          entry,
          "import { createForm, createDefaultRegistry, FormRoot } from './package/dist/index.js'; export { createForm, createDefaultRegistry, FormRoot }",
        )
        await build({
          configFile: false,
          root: extractDir,
          plugins: [solid()],
          resolve: { conditions: ['browser'] },
          build: {
            lib: { entry, formats: ['es'], fileName: 'consumer' },
            outDir: 'consumer-dist',
            rollupOptions: { external: ['@texaryn/core'] },
          },
        })
        const consumerRequire = createRequire(join(process.cwd(), pkg.dir, 'package.json'))
        const { JSDOM } = consumerRequire('jsdom')
        solidDom = new JSDOM('', { url: 'http://localhost/' })
        solidDomGlobalDescriptors = new Map()
        for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'MutationObserver']) {
          solidDomGlobalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
          Object.defineProperty(globalThis, key, {
            configurable: true,
            writable: true,
            value: solidDom.window[key],
          })
        }
        mod = await import(pathToFileURL(join(extractDir, 'consumer-dist', 'consumer.js')).href)
      } else {
        mod = await import(join(extractDir, 'package', 'dist', 'index.js'))
      }
      const expectedExports = pkg.name === '@texaryn/core'
        ? ['createFormRuntime', 'createDocumentRuntime', 'createDocumentUpdateSession']
        : pkg.name === '@texaryn/svelte'
          ? ['createForm', 'bindFormRuntime', 'createDefaultRegistry', 'FormRoot']
          : pkg.name === '@texaryn/solid'
            ? ['createForm', 'createDefaultRegistry', 'FormRoot']
            : [pkg.expectedExport]
      for (const expectedExport of expectedExports) {
        if (!(expectedExport in mod)) {
          console.error(`Expected export "${expectedExport}" not found in ${pkg.name}`)
          failed = true
        } else {
          console.log(`  ok: ${expectedExport} exported`)
        }
      }
      if (pkg.name === '@texaryn/schema-json') {
        const schema = {
          type: 'object',
          properties: { flag: { type: 'boolean' } },
          dependencies: {
            flag: {
              oneOf: [
                { properties: { flag: { const: false } } },
                { properties: { flag: { const: true }, extra: { type: 'string' } }, required: ['extra'] },
              ],
            },
          },
        }
        const adapter = await mod.createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
        const projection = adapter.project({ flag: true })
        const validation = await adapter.validate({ flag: true })
        if (!projection.nodes.has('/flag') || validation.valid) {
          console.error('Packed schema-json consumer regression failed')
          failed = true
        } else {
          console.log('  ok: packed consumer projects and rejects invalid oneOf dependencies')
        }
      }
      if (pkg.name === '@texaryn/core') {
        const document = {
          version: 2,
          rootId: 'root',
          nodes: {
            root: {
              id: 'root',
              type: 'container',
              parentId: null,
              annotations: { title: 'Smoke test' },
              containerType: 'group',
              children: [],
            },
          },
        }
        const runtime = mod.createDocumentRuntime(document, { initialData: {} })
        const session = mod.createDocumentUpdateSession(runtime, { onNotificationError: () => undefined })
        session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document, data: {} })
        session.apply({ protocol: 1, kind: 'update', revision: 1, patch: [] })
        if (session.getRevision() !== 1) {
          console.error('Packed core document update session did not advance its revision')
          failed = true
        } else {
          console.log('  ok: packed document update session smoke test')
        }
      }
    } catch (err) {
      console.error(`Import failed for ${pkg.name}: ${err.message}`)
      failed = true
    }
  } finally {
    if (solidDom) {
      solidDom.window.close()
      for (const [key, descriptor] of solidDomGlobalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
    rmSync(tmp, { recursive: true, force: true })
    if (isolatedConsumerDir) rmSync(isolatedConsumerDir, { recursive: true, force: true })
  }
}

if (failed) {
  console.error('\nVerification failed.')
  process.exit(1)
} else {
  console.log('\nAll packages verified.')
}
