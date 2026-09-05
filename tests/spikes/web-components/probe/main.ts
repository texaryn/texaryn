import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createDefaultRegistry, defineTexarynForm } from '../src/index.js'
import type { TexarynFormElement } from '../src/index.js'
import { conditionalSchema, listSchema } from '../src/__tests__/harness.js'

// `?legacy=1` removes the atomic move so the insertBefore fallback and the
// focus anchor rule are what get exercised.
const legacy = new URLSearchParams(location.search).get('legacy') === '1'
if (legacy) {
  delete (Element.prototype as unknown as Record<string, unknown>).moveBefore
}

defineTexarynForm()
const registry = createDefaultRegistry()

const conditional = document.getElementById('conditional') as TexarynFormElement
conditional.registry = registry
conditional.options = { initialData: { kind: 'a' }, validationDebounceMs: 0 }
conditional.port = await createJsonSchemaAdapter(conditionalSchema)

const list = document.getElementById('list') as TexarynFormElement
list.registry = registry
list.options = {
  initialData: { items: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
  hints: { '/items': { canReorder: true } },
  validationDebounceMs: 0,
}
list.port = await createJsonSchemaAdapter(listSchema)

const moveUp = document.getElementById('move-up') as HTMLButtonElement
// Keeps focus where it is: a toolbar button that steals focus would make the
// probe measure the button, not the reconciliation.
moveUp.addEventListener('mousedown', (event) => event.preventDefault())
moveUp.addEventListener('click', () => {
  const runtime = list.runtime!
  const doc = runtime.document.getSnapshot()
  const container = Object.values(doc.nodes).find((n) => n.dataPointer === '/items')!
  runtime.dispatch({ type: 'MoveItem', containerId: container.id, from: 1, to: 0 })
})

const status = document.getElementById('status') as HTMLPreElement
function report(): void {
  const active = document.activeElement as HTMLInputElement | null
  const rows = Array.from(list.querySelectorAll<HTMLElement>('.texaryn-array-item'))
  status.textContent = JSON.stringify(
    {
      moveBefore: typeof (Element.prototype as unknown as Record<string, unknown>).moveBefore === 'function',
      active: active ? { name: active.name, value: active.value, selectionStart: active.selectionStart } : null,
      rows: rows.map((r) => ({ item: r.dataset.itemId, name: r.querySelector('input')?.name, value: r.querySelector('input')?.value })),
      conditional: conditional.runtime?.data.getSnapshot(),
      list: list.runtime?.data.getSnapshot(),
    },
    null,
    2,
  )
}
document.addEventListener('focusin', report)
document.addEventListener('focusout', report)
document.addEventListener('input', report)
document.addEventListener('selectionchange', report)
list.addEventListener('texaryn-data-change', report)
report()
