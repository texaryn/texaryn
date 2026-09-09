// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { resolveTemplateParameters } from './resolve-template.js'
import { templateYaml, fragmentPath, fragmentUrl } from '../template.js'

/**
 * The fragment is fetched over a real socket rather than handed over from
 * disk. Backstage's resolver receives a `read` from the catalog's `UrlReader`,
 * so substituting the reader is the same seam upstream uses; serving the bytes
 * over HTTP is what keeps the parse-and-splice path honest, because a resolver
 * that only ever sees a local string proves nothing about the documented
 * remote-only mechanism.
 */
let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/parameters-pickers.yaml') {
      response.writeHead(200, { 'content-type': 'text/yaml' })
      response.end(readFileSync(fragmentPath, 'utf8'))
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address() as AddressInfo
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((done, fail) => server.close((e) => (e ? fail(e) : done())))
})

/**
 * Stands in for Backstage's `UrlReader`, which is what maps a template's
 * declared URL to bytes. The committed template carries the GitHub URL a real
 * template would, and this maps it onto the test server.
 */
const read = async (url: string): Promise<string> => {
  const mapped = url === fragmentUrl ? `${origin}/parameters-pickers.yaml` : url
  const response = await fetch(mapped)
  if (!response.ok) throw new Error(`${response.status} for ${mapped}`)
  return response.text()
}

describe('resolving the template the way Backstage does', () => {
  it('returns every step, with the $yaml placeholder replaced', async () => {
    const steps = await resolveTemplateParameters(templateYaml, read)

    expect(steps.map((s) => s.title)).toEqual([
      'Basic widgets',
      'Numbers, ranges and toggles',
      'Selects and groups',
      'Dates and files',
      'Nested objects and arrays',
      'Fill in some steps',
      'Catalog and repo pickers',
    ])
  })

  it('splices the fragment in as a step, not as a reference to one', async () => {
    const steps = await resolveTemplateParameters(templateYaml, read)
    const pickers = steps[6]

    expect(Object.keys(pickers)).toEqual(['title', 'properties'])
    expect(Object.keys(pickers.properties as object)).toContain('repoUrl')
    // Whatever the form layer receives, it cannot tell this step came from
    // somewhere else. That is the whole point of the mechanism, and the reason
    // it says nothing about a schema-level resolver.
    expect(JSON.stringify(pickers)).not.toContain('$yaml')
    expect(JSON.stringify(pickers)).not.toContain(fragmentUrl)
  })

  it('leaves a $ref alone, as the catalog processor does', async () => {
    // The behaviour that decides whether Backstage ever needs Texaryn to
    // resolve an external reference: `ref` is not a registered placeholder, so
    // a $ref survives placeholder processing untouched and arrives at the form
    // layer as a JSON Schema keyword.
    const withRef = templateYaml.replace(
      '    - title: Basic widgets',
      '    - title: Basic widgets\n      $ref: https://example.com/schema.json',
    )
    const steps = await resolveTemplateParameters(withRef, read)
    expect(steps[0].$ref).toBe('https://example.com/schema.json')
  })

  it('refuses a fragment that is not exactly one document', async () => {
    const twoDocuments = async () => 'title: One\n---\ntitle: Two\n'
    await expect(resolveTemplateParameters(templateYaml, twoDocuments)).rejects.toThrow(
      /expected to find exactly one document/,
    )
  })
})
