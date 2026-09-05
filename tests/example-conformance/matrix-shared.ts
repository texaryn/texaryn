// The framework-neutral half of the compatibility matrix.
//
// The matrix asks one question the per-layer proofs do not: can every scenario
// the catalog advertises make it through each renderer? Semantic proofs live
// where each capability's `verification` field says they do and are not
// repeated here, so this stays compatibility coverage rather than a second
// behaviour suite.
//
// Only what is genuinely shared lives here: which examples exist, how an
// adapter and document are built from one, which active nodes a registry
// fails to resolve, and how a failure reads. Mounting does not, because React
// and Vue do not share a mounting model and pretending otherwise would mean a
// harness that fits neither.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { SchemaEvaluationPort, UIDocument, UINode } from '@texaryn/core'
import { examples } from '@texaryn/examples'
import type { TexarynExample } from '@texaryn/examples'

/** Every catalog example, in the tuple shape `describe.each` wants. */
export const catalog = examples.map((example) => [example.id, example] as const)

export function adapterFor(example: TexarynExample): Promise<SchemaEvaluationPort> {
  return createJsonSchemaAdapter(example.schema, { defaultDialect: example.dialect })
}

/**
 * A document for an example, without any renderer involved. Used by the
 * resolution claim, which is about the registry rather than about rendering.
 */
export async function documentFor(example: TexarynExample): Promise<UIDocument> {
  const port = await adapterFor(example)
  const runtime = createFormRuntime(port, {
    initialData: example.initialData,
    hints: example.hints,
  })
  const document = runtime.document.getSnapshot()
  runtime.destroy()
  return document
}

/** Named so a failure says which nodes, not just how many. */
export function unresolvedActiveNodes(
  document: UIDocument,
  resolve: (node: UINode) => unknown,
): string[] {
  return Object.values(document.nodes)
    .filter((node) => node.visible)
    .filter((node) => resolve(node) === undefined)
    .map((node) => `${node.type}:${node.dataPointer ?? 'root'}`)
}

export function unresolvedMessage(renderer: string, exampleId: string): string {
  return `${renderer} has no widget for these active nodes in ${exampleId}`
}

export function consoleMessage(renderer: string, exampleId: string, level: string): string {
  return `${exampleId} logged a console ${level} under ${renderer}`
}

export function emptyRenderMessage(exampleId: string): string {
  return `${exampleId} rendered nothing`
}

/**
 * Both frameworks report a bad render through the console rather than by
 * throwing, so a silent render is part of what the matrix claims.
 */
export function captureConsole(): { errors: () => string[]; warnings: () => string[] } {
  let error: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    error.mockRestore()
    warn.mockRestore()
  })

  return {
    errors: () => error.mock.calls.map((call) => String(call[0])),
    warnings: () => warn.mock.calls.map((call) => String(call[0])),
  }
}

/**
 * Claim two of the matrix: every node the document says is active has a
 * widget in this renderer's registry. Framework-neutral, because resolving is
 * a question about the registry and the document rather than about mounting.
 */
export function widgetResolutionSuite(
  renderer: string,
  resolve: (node: UINode) => unknown,
): void {
  it('covers every registered example', () => {
    expect(catalog.length).toBeGreaterThan(0)
  })

  describe.each(catalog)('%s', (_id, example) => {
    it('resolves a widget for every active node', async () => {
      const document = await documentFor(example)
      expect(
        unresolvedActiveNodes(document, resolve),
        unresolvedMessage(renderer, example.id),
      ).toEqual([])
    })
  })
}
