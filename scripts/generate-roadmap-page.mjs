import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'ROADMAP.md')
const outputPath = resolve(root, 'apps/docs/src/content/docs/roadmap.md')
const githubSource = 'https://github.com/texaryn/texaryn/blob/main/'
const websitePath = '/texaryn/concepts/performance/'

const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n?/g, '\n')
const title = '# Texaryn: Product Roadmap\n'
if (!source.startsWith(title)) {
  throw new Error(`Expected ${sourcePath} to begin with ${JSON.stringify(title)}.`)
}

const body = source
  .slice(title.length)
  .replace(/^\n+/, '')
  .replaceAll(
    '](apps/docs/src/content/docs/concepts/performance.md)',
    `](${websitePath})`,
  )
  .replace(/\]\((docs\/[^)]+\.md)\)/g, `](${githubSource}$1)`)
  .replace(/\]\((packages\/[^)]+)\)/g, `](${githubSource}$1)`)

const page = [
  '---',
  'title: Texaryn roadmap',
  'description: First stable release status, available capabilities, and evidence based follow ups.',
  '---',
  '',
  body,
].join('\n')

const current = await readFile(outputPath, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return undefined
  throw error
})

if (current !== page) await writeFile(outputPath, page)
