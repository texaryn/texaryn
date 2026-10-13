import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
if (process.argv.length < 3) {
  throw new Error('Pass the directory containing the stable package tarballs')
}
const tarballDirectory = resolve(process.argv[2] ?? '')
const npmExecutable = join(dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm')
const packageSpecs = [
  { name: '@texaryn/core', dir: 'packages/core' },
  { name: '@texaryn/schema-json', dir: 'packages/schema-json' },
  { name: '@texaryn/react', dir: 'packages/react' },
]
const reactMatrix = [
  { react: '18.3.1', types: '18.3.31', reactDomTypes: '18.3.7' },
  { react: '19.3.0', types: '19.3.0', reactDomTypes: '19.3.0' },
]
const tempRoot = mkdtempSync(join(tmpdir(), 'texaryn-stable-release-'))

function collectCoreVersions(dependencies, versions = []) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    if (name === '@texaryn/core') versions.push(dependency.version)
    collectCoreVersions(dependency.dependencies, versions)
  }
  return versions
}

try {
  const manifests = packageSpecs.map((pkg) => ({
    ...pkg,
    manifest: JSON.parse(readFileSync(join(root, pkg.dir, 'package.json'), 'utf8')),
  }))
  const tarballs = manifests.map(({ name, manifest }) => {
    const packageSlug = name.replace(/^@/, '').replace('/', '-')
    const tarball = join(tarballDirectory, `${packageSlug}-${manifest.version}.tgz`)
    if (!existsSync(tarball)) throw new Error(`Missing packed tarball for ${name}: ${tarball}`)
    return tarball
  })

  const expectedCoreVersion = manifests[0].manifest.version
  const peerRange = manifests[2].manifest.peerDependencies?.react
  if (peerRange !== '^18.3.0 || ^19.0.0') {
    throw new Error(`Expected the stable React peer range, received ${peerRange}`)
  }

  for (const versions of reactMatrix) {
    const consumer = join(tempRoot, `consumer-react-${versions.react}`)
    mkdirSync(consumer)
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'texaryn-stable-consumer',
      private: true,
      type: 'module',
    }))
    writeFileSync(join(consumer, 'consumer.tsx'), `
import { renderToStaticMarkup } from 'react-dom/server'
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createDefaultRegistry, FormProvider, FormRoot, useForm } from '@texaryn/react'

const adapter = await createJsonSchemaAdapter({
  type: 'object',
  title: 'Stable consumer',
  properties: { name: { type: 'string', title: 'Name' } },
})
const runtime = createFormRuntime(adapter, { initialData: { name: 'Ada' } })
const registry = createDefaultRegistry()

function ExampleForm() {
  const form = useForm(adapter, { initialData: { name: 'Ada' } })
  return (
    <FormProvider value={form.runtime}>
      <form noValidate>
        <FormRoot registry={registry} />
      </form>
    </FormProvider>
  )
}

const markup = renderToStaticMarkup(<ExampleForm />)
if (!runtime || !markup.includes('Ada') || !markup.includes('Name')) {
  throw new Error('Texaryn React form did not render')
}
`)

    execFileSync(npmExecutable, [
      'install',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      ...tarballs,
      `react@${versions.react}`,
      `react-dom@${versions.react}`,
      `@types/react@${versions.types}`,
      `@types/react-dom@${versions.reactDomTypes}`,
      'typescript@5.8.3',
    ], { cwd: consumer, stdio: 'inherit' })

    const modules = join(consumer, 'node_modules')
    execFileSync(process.execPath, [join(modules, 'typescript', 'bin', 'tsc'),
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--target', 'ES2022',
      '--strict',
      '--jsx', 'react-jsx',
      '--types', 'react',
      '--outDir', 'dist',
      'consumer.tsx',
    ], { cwd: consumer, stdio: 'inherit' })
    execFileSync(process.execPath, [join(consumer, 'dist', 'consumer.js')], { cwd: consumer, stdio: 'inherit' })

    const installed = JSON.parse(execFileSync(npmExecutable, ['ls', '@texaryn/core', '--all', '--json'], {
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
