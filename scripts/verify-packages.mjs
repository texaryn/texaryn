import { execSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const packages = [
  {
    name: '@texaryn/core',
    dir: 'packages/core',
    expectedExport: 'createFormRuntime',
  },
  {
    name: '@texaryn/schema-json',
    dir: 'packages/schema-json',
    expectedExport: 'createJsonSchemaAdapter',
  },
  {
    name: '@texaryn/react',
    dir: 'packages/react',
    expectedExport: 'useForm',
  },
  {
    name: '@texaryn/react-bootstrap',
    dir: 'packages/react-bootstrap',
    expectedExport: 'createBootstrapRegistry',
  },
  {
    name: '@texaryn/react-mui',
    dir: 'packages/react-mui',
    expectedExport: 'createMuiRegistry',
  },
]

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

    if (pkg.name === '@texaryn/react-bootstrap' || pkg.name === '@texaryn/react-mui') {
      const manifest = JSON.parse(execSync(`tar xzf ${tarball} -O package/package.json`, { encoding: 'utf8' }))
      for (const [field, dep] of [['dependencies', '@texaryn/core'], ['peerDependencies', '@texaryn/react']]) {
        const range = manifest[field]?.[dep]
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
      execSync(`npx attw --profile esm-only ${tarball}`, { stdio: 'inherit' })
    } catch {
      console.error(`attw failed for ${pkg.name}`)
      failed = true
    }

    console.log(`\n  import smoke test:`)
    const extractDir = join(tmp, 'extracted')
    execSync(`mkdir -p ${extractDir} && tar xzf ${tarball} -C ${extractDir}`)
    try {
      const mod = await import(join(extractDir, 'package', 'dist', 'index.js'))
      if (!(pkg.expectedExport in mod)) {
        console.error(`Expected export "${pkg.expectedExport}" not found in ${pkg.name}`)
        failed = true
      } else {
        console.log(`  ok: ${pkg.expectedExport} exported`)
      }
    } catch (err) {
      console.error(`Import failed for ${pkg.name}: ${err.message}`)
      failed = true
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (failed) {
  console.error('\nVerification failed.')
  process.exit(1)
} else {
  console.log('\nAll packages verified.')
}
