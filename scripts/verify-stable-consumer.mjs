import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageSpecs = [
  { name: '@texaryn/core', dir: 'packages/core' },
  { name: '@texaryn/schema-json', dir: 'packages/schema-json' },
  { name: '@texaryn/react', dir: 'packages/react' },
]
const reactMatrix = [
  { react: '18.3.1', types: '18.3.31' },
  { react: '19.3.0', types: '19.3.0' },
]
const tempRoot = mkdtempSync(join(tmpdir(), 'texaryn-stable-release-'))

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

function readPackedManifest(tarball) {
  return JSON.parse(execFileSync('tar', ['xOf', tarball, 'package/package.json'], { encoding: 'utf8' }))
}

function collectCoreVersions(dependencies, versions = []) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    if (name === '@texaryn/core') versions.push(dependency.version)
    collectCoreVersions(dependency.dependencies, versions)
  }
  return versions
}

try {
  const tarballDirectory = join(tempRoot, 'tarballs')
  mkdirSync(tarballDirectory)
  const tarballs = []

  for (const pkg of packageSpecs) {
    run('pnpm', ['pack', '--pack-destination', tarballDirectory], {
      cwd: join(root, pkg.dir),
      stdio: 'ignore',
    })
    const produced = readdirSync(tarballDirectory)
      .filter((file) => file.endsWith('.tgz'))
      .map((file) => join(tarballDirectory, file))
    const matches = produced.filter((path) => readPackedManifest(path).name === pkg.name)
    if (matches.length !== 1) {
      throw new Error(`Expected one packed tarball for ${pkg.name}, found ${matches.length}`)
    }
    tarballs.push(matches[0])
  }

  const expectedCoreVersion = readPackedManifest(tarballs[0]).version
  const peerRange = readPackedManifest(tarballs[2]).peerDependencies?.react
  if (peerRange !== '^18.3.0 || ^19.0.0') {
    throw new Error(`Expected the stable React peer range, received ${peerRange}`)
  }

  for (const versions of reactMatrix) {
    const consumer = join(tempRoot, `consumer-react-${versions.react}`)
    mkdirSync(consumer)
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'texaryn-stable-consumer', private: true }))
    writeFileSync(join(consumer, 'consumer.mts'), [
      "import { createFormRuntime } from '@texaryn/core'",
      "import { createJsonSchemaAdapter } from '@texaryn/schema-json'",
      "import { useForm } from '@texaryn/react'",
      "const adapter = await createJsonSchemaAdapter({ type: 'object', properties: { name: { type: 'string' } } })",
      "const runtime = createFormRuntime(adapter, { initialData: { name: 'Ada' } })",
      'if (!runtime || typeof useForm !== \'function\') throw new Error(\'Texaryn consumer imports failed\')',
    ].join('\n'))

    run('npm', [
      'install',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      ...tarballs,
      `react@${versions.react}`,
      `@types/react@${versions.types}`,
      'typescript@5.8.3',
    ], { cwd: consumer })

    const modules = join(consumer, 'node_modules')
    run(join(modules, '.bin', 'tsc'), [
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--target', 'ES2022',
      '--strict',
      '--skipLibCheck',
      '--types', 'react',
      '--outDir', 'dist',
      'consumer.mts',
    ], { cwd: consumer })
    run('node', [join(consumer, 'dist', 'consumer.mjs')], { cwd: consumer })

    const installed = JSON.parse(execFileSync('npm', ['ls', '@texaryn/core', '--all', '--json'], {
      cwd: consumer,
      encoding: 'utf8',
    }))
    const coreVersions = collectCoreVersions(installed.dependencies)
    const distinctCoreVersions = [...new Set(coreVersions)]
    if (distinctCoreVersions.length !== 1 || distinctCoreVersions[0] !== expectedCoreVersion) {
      throw new Error(`Expected one @texaryn/core@${expectedCoreVersion}, found ${coreVersions.join(', ')}`)
    }

    console.log(`Verified stable consumer with React ${versions.react} and @texaryn/core@${expectedCoreVersion}`)
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
