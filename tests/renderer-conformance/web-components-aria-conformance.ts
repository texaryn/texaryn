// Semantics rather than markup: every assertion goes through a role, an
// accessible name or a state attribute, so a renderer stays free to change
// its elements as long as assistive technology hears the same thing.
//
// Separate from the React suite rather than a generalisation of it. That one
// mounts through React Testing Library and asserts on ErrorSummary, which is
// a React component; sharing would mean a harness that fits neither. What is
// genuinely shared is the claim list, and it is the same list here.
import { describe, it, expect, afterEach } from 'vitest'
import { within } from '@testing-library/dom'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, RendererRegistry, UIHints } from '@texaryn/core'
import { defineTexarynForm } from '@texaryn/web-components'
import type { TexarynFormElement, WidgetFactory } from '@texaryn/web-components'

export interface WebComponentsAriaOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetFactory>
}

const IDREF_ATTRIBUTES = [
  'for',
  'aria-describedby',
  'aria-labelledby',
  'aria-controls',
  'aria-errormessage',
  'aria-owns',
]

export function webComponentsAriaConformance({
  name,
  createRegistry,
}: WebComponentsAriaOptions): void {
  const registry = createRegistry()
  defineTexarynForm()

  const requiredStringSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Full Name', description: 'Your legal name', minLength: 1 },
      nickname: { type: 'string', title: 'Nickname' },
    },
    required: ['name'],
  }

  const kindsSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name' },
      age: { type: 'integer', title: 'Age' },
      agree: { type: 'boolean', title: 'Agree' },
      role: { type: 'string', title: 'Role', enum: ['dev', 'pm'] },
      code: { type: 'string', title: 'Code', readOnly: true },
    },
  }

  const groupedSchema = {
    type: 'object',
    properties: {
      address: {
        type: 'object',
        title: 'Address',
        properties: { city: { type: 'string', title: 'City' } },
      },
    },
  }

  // A conditional subschema can add or drop a title on a recompile, and the
  // widget survives that, so grouping has to follow the node rather than the
  // node it first mounted with.
  const conditionalTitleSchema = {
    type: 'object',
    properties: {
      mode: { type: 'string', title: 'Mode' },
      address: { type: 'object', properties: { city: { type: 'string', title: 'City' } } },
    },
    if: { properties: { mode: { const: 'b' } }, required: ['mode'] },
    then: {
      properties: {
        address: {
          type: 'object',
          title: 'Address',
          properties: { city: { type: 'string', title: 'City' } },
        },
      },
    },
  }

  // Node ids are positional, so moving a row hands every descendant widget a
  // new id. Ids, label targets and descriptions have to follow the row.
  const rowsSchema = {
    type: 'object',
    properties: {
      people: {
        type: 'array',
        title: 'People',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', title: 'Name', description: 'Full legal name', minLength: 3 },
          },
        },
      },
    },
  }

  const runtimes: FormRuntime[] = []

  async function mount(
    schema: unknown,
    data: unknown,
    hints?: UIHints,
  ): Promise<TexarynFormElement> {
    const port = await createJsonSchemaAdapter(schema)
    const runtime = createFormRuntime(port, { initialData: data, hints, validationDebounceMs: 0 })
    runtimes.push(runtime)
    const element = document.createElement('texaryn-form') as TexarynFormElement
    element.registry = registry
    element.runtime = runtime
    document.body.append(element)
    return element
  }

  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  function blur(control: HTMLElement): void {
    control.dispatchEvent(new Event('blur'))
  }

  function type(control: HTMLInputElement, value: string): void {
    control.value = value
    control.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function submit(element: TexarynFormElement): void {
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  function idrefs(element: Element): Array<{ attribute: string; id: string }> {
    const out: Array<{ attribute: string; id: string }> = []
    for (const node of element.querySelectorAll('*')) {
      for (const attribute of IDREF_ATTRIBUTES) {
        const value = node.getAttribute(attribute)
        if (!value) continue
        for (const id of value.split(/\s+/).filter(Boolean)) out.push({ attribute, id })
      }
    }
    return out
  }

  describe(`Web Components ARIA conformance (${name})`, () => {
    afterEach(() => {
      document.body.replaceChildren()
      while (runtimes.length > 0) runtimes.pop()!.destroy()
    })

    it('every control is reachable by role and accessible name', async () => {
      const element = await mount(kindsSchema, {
        name: '',
        age: 0,
        agree: false,
        role: 'dev',
        code: 'x',
      })
      const q = within(element)
      expect(q.getByRole('textbox', { name: 'Name' })).toBeTruthy()
      expect(q.getByRole('spinbutton', { name: 'Age' })).toBeTruthy()
      expect(q.getByRole('checkbox', { name: 'Agree' })).toBeTruthy()
      expect(q.getByRole('combobox', { name: 'Role' })).toBeTruthy()
    })

    it('required is announced through aria-required and never through the native attribute', async () => {
      const element = await mount(requiredStringSchema, { name: '', nickname: '' })
      const q = within(element)
      const required = q.getByRole('textbox', { name: 'Full Name' })
      const optional = q.getByRole('textbox', { name: 'Nickname' })
      expect(required.getAttribute('aria-required')).toBe('true')
      // The native attribute would hand validation to the browser, ahead of the runtime.
      expect(required.hasAttribute('required')).toBe(false)
      expect(optional.getAttribute('aria-required')).toBeNull()
    })

    it('a readOnly field is disabled and its neighbours are not', async () => {
      const element = await mount(kindsSchema, {
        name: '',
        age: 0,
        agree: false,
        role: 'dev',
        code: 'x',
      })
      const q = within(element)
      expect((q.getByRole('textbox', { name: 'Code' }) as HTMLInputElement).disabled).toBe(true)
      expect((q.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).disabled).toBe(false)
    })

    it('untouched invalid field: no aria-invalid, no alert', async () => {
      const element = await mount(
        requiredStringSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const q = within(element)
      expect(q.getByRole('textbox', { name: 'Full Name' }).getAttribute('aria-invalid')).toBeNull()
      expect(q.queryByRole('alert')).toBeNull()
    })

    it('touched invalid field: aria-invalid, an alert, and aria-describedby pointing at it', async () => {
      const element = await mount(
        requiredStringSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const q = within(element)
      const input = q.getByRole('textbox', { name: 'Full Name' })
      blur(input)
      await flush()

      expect(input.getAttribute('aria-invalid')).toBe('true')
      const alert = q.getByRole('alert')
      expect(alert.textContent).not.toBe('')
      const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
      expect(describedBy).toContain(alert.id)
      for (const id of describedBy) {
        expect(element.contains(document.getElementById(id))).toBe(true)
      }
    })

    it('the description is associated with the control and survives the error', async () => {
      const element = await mount(
        requiredStringSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const input = within(element).getByRole('textbox', { name: 'Full Name' })
      const describedBy = (): string[] =>
        (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)

      const description = describedBy()
        .map((id) => document.getElementById(id)!)
        .find((el) => el.textContent === 'Your legal name')
      expect(description).toBeTruthy()

      blur(input)
      await flush()
      expect(describedBy()).toContain(description!.id)
    })

    it('errors clear once valid data is entered after a touched-invalid state', async () => {
      const element = await mount(
        requiredStringSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const q = within(element)
      const input = q.getByRole('textbox', { name: 'Full Name' }) as HTMLInputElement
      blur(input)
      await flush()
      expect(input.getAttribute('aria-invalid')).toBe('true')

      type(input, 'Alice')
      blur(input)
      await flush()
      expect(input.getAttribute('aria-invalid')).toBeNull()
      expect(q.queryByRole('alert')).toBeNull()
    })

    it('a failed Submit marks untouched invalid fields and a later valid Submit clears them', async () => {
      const element = await mount(requiredStringSchema, { name: '', nickname: '' })
      const q = within(element)
      const input = q.getByRole('textbox', { name: 'Full Name' }) as HTMLInputElement
      expect(input.getAttribute('aria-invalid')).toBeNull()

      submit(element)
      await flush()
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(q.getAllByRole('alert').length).toBeGreaterThan(0)

      type(input, 'Alice')
      submit(element)
      await flush()
      expect(input.getAttribute('aria-invalid')).toBeNull()
      expect(q.queryByRole('alert')).toBeNull()
    })

    it('a titled nested object is exposed as a group with that name', async () => {
      const element = await mount(groupedSchema, { address: { city: 'Paris' } })
      const group = within(element).getByRole('group', { name: 'Address' })
      expect(within(group).getByRole('textbox', { name: 'City' })).toBeTruthy()
    })

    it('grouping follows the node when a title appears and disappears on recompile', async () => {
      const element = await mount(conditionalTitleSchema, {
        mode: 'a',
        address: { city: 'Paris' },
      })
      const q = within(element)
      const runtime = runtimes[runtimes.length - 1]
      const modeId = Object.values(runtime.document.getSnapshot().nodes).find(
        (n) => n.dataPointer === '/mode',
      )!.id
      const city = (): HTMLElement => q.getByRole('textbox', { name: 'City' })

      const cityBefore = city()
      expect(q.queryByRole('group')).toBeNull()

      runtime.dispatch({ type: 'SetValue', nodeId: modeId, value: 'b' })
      await flush()
      const group = q.getByRole('group', { name: 'Address' })
      expect(within(group).getByRole('textbox', { name: 'City' })).toBe(cityBefore)

      runtime.dispatch({ type: 'SetValue', nodeId: modeId, value: 'a' })
      await flush()
      expect(q.queryByRole('group')).toBeNull()
      // The grouping change must not rebuild what it wraps.
      expect(city()).toBe(cityBefore)
    })

    it('ids, labels and descriptions are rewritten when a row moves', async () => {
      const element = await mount(
        rowsSchema,
        { people: [{ name: 'Ann' }, { name: 'Bo' }] },
        { '/people': { canReorder: true } },
      )
      const q = within(element)
      const runtime = runtimes[runtimes.length - 1]
      const listId = Object.values(runtime.document.getSnapshot().nodes).find(
        (n) => n.dataPointer === '/people',
      )!.id
      const inputs = (): HTMLInputElement[] =>
        q.getAllByRole('textbox', { name: 'Name' }) as HTMLInputElement[]

      const [ann, bo] = inputs()
      expect([ann.value, bo.value]).toEqual(['Ann', 'Bo'])
      const idBefore = [ann.id, bo.id]

      runtime.dispatch({ type: 'MoveItem', containerId: listId, from: 1, to: 0 })
      await flush()

      const [first, second] = inputs()
      expect(first.value, 'the row keeps its input element').toBe('Bo')
      expect(first.name).toBe('/people/0/name')
      expect(second.name).toBe('/people/1/name')

      const describedText = (input: HTMLInputElement): string[] =>
        (input.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent ?? '')
      expect(describedText(first)).toContain('Full legal name')
      expect(describedText(second)).toContain('Full legal name')

      for (const { attribute, id } of idrefs(element)) {
        const target = document.getElementById(id)
        expect(target, `${attribute}="${id}" should resolve`).not.toBeNull()
        expect(element.contains(target), `${attribute}="${id}" points outside the form`).toBe(true)
      }
      for (const label of element.querySelectorAll('label')) {
        expect(element.contains(document.getElementById(label.htmlFor))).toBe(true)
      }
      const live = Array.from(element.querySelectorAll('[id]')).map((n) => n.id)
      expect(new Set(live).size, 'ids stay unique after the move').toBe(live.length)
      // The id belongs to the position while the widget follows the row, so
      // the moved row has to be re-stamped with the id of its new position.
      expect([first.id, second.id]).toEqual(idBefore)
    })


    it('two instances with equivalent schemas share no ids and make no cross-instance references', async () => {
      const a = await mount(
        requiredStringSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const b = await mount(
        requiredStringSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      for (const element of [a, b]) {
        blur(within(element).getByRole('textbox', { name: 'Full Name' }))
      }
      await flush()

      const ids = (element: Element): string[] =>
        Array.from(element.querySelectorAll('[id]')).map((n) => n.id)
      expect(ids(a).length).toBeGreaterThan(0)
      expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([])
      expect(new Set([...ids(a), ...ids(b)]).size).toBe(ids(a).length + ids(b).length)

      for (const [element, other] of [
        [a, b],
        [b, a],
      ] as const) {
        for (const { attribute, id } of idrefs(element)) {
          const target = document.getElementById(id)
          expect(target, `${attribute}="${id}" should resolve`).not.toBeNull()
          expect(
            element.contains(target),
            `${attribute}="${id}" points outside its own instance`,
          ).toBe(true)
          expect(other.contains(target), `${attribute}="${id}" points into the other form`).toBe(
            false,
          )
        }
      }
    })
  })
}
