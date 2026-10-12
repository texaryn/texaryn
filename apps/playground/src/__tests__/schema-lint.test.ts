import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { json } from '@codemirror/lang-json'

const pending: ((issues: { pointer: string; code: string; message: string }[]) => void)[] = []

vi.mock('@texaryn/schema-json', () => ({
  checkSchema: () => new Promise((resolve) => pending.push(resolve)),
}))

const { schemaLintSource } = await import('../editor/schema-lint.js')

describe('schemaLintSource', () => {
  it('drops the count of a check the document has outrun', async () => {
    const counts: (number | null)[] = []
    const source = schemaLintSource((count) => counts.push(count))
    const view = { state: EditorState.create({ doc: '{"type":"strin"}', extensions: [json()] }) } as { state: EditorState }

    const first = source(view as unknown as EditorView)
    view.state = EditorState.create({ doc: '{"type":"x","minLength":"3"}', extensions: [json()] })
    const second = source(view as unknown as EditorView)

    pending[1]!([
      { pointer: '/type', code: 'schema-error', message: 'a' },
      { pointer: '/minLength', code: 'schema-error', message: 'b' },
    ])
    await second
    pending[0]!([{ pointer: '/type', code: 'schema-error', message: 'c' }])
    await first

    expect(counts).toEqual([2])
  })
})
