// DOM-level accessibility contract, shared by every binding.
//
// Checks roles, computed accessible names and descriptions, accessibility
// state attributes, and DOM relationship integrity, in jsdom.
//
// It does not prove browser accessibility-tree events, focus behaviour,
// live-region announcement, or screen-reader output. Those need a real
// browser, and the Web Components package proves the focus and caret half of
// them in its Chromium suite. The accessible-name and description algorithms
// here come from dom-accessibility-api, a JavaScript implementation for
// testing rather than a browser's own, so treat this as a DOM contract and
// not as evidence about what anyone hears.
//
// The suite owns the runtime. Each binding supplies only how to mount over a
// runtime it is handed, how to let its framework settle, and how to unmount,
// because that is the only part that genuinely differs. State transitions are
// driven through the runtime rather than through events, so what is under test
// is how a binding represents runtime state in the DOM, not its event
// plumbing, which each binding tests on its own.
import { describe, it, expect, afterEach } from 'vitest'
import { within } from '@testing-library/dom'
import { computeAccessibleDescription } from 'dom-accessibility-api'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, NodeId, UIHints } from '@texaryn/core'

/** How one binding puts a runtime on the page. Everything else is shared. */
export interface MountedSurface {
  /** The element the binding rendered into. */
  root: HTMLElement
  /**
   * Runs a mutation and lets the framework settle: React needs `act`, Vue
   * needs `nextTick`, a custom element needs its microtask flush. Without this
   * the contract would have to know which binding it is testing.
   */
  act(run: () => void): Promise<void>
  unmount(): void | Promise<void>
}

export interface DomAccessibilityAdapter {
  name: string
  mount(args: { runtime: FormRuntime; host: HTMLElement }): Promise<MountedSurface> | MountedSurface
}

/**
 * A defect a binding is known to have, named precisely enough that an
 * unrelated failure cannot masquerade as it. `it.fails` would accept any
 * throw, including a broken adapter; this accepts only the stated diagnosis,
 * and fails once the defect is fixed so the declaration has to be removed.
 */
export type KnownGap = 'duplicate-id' | 'cross-instance-reference' | 'missing-named-group'

export interface DomAccessibilityOptions {
  adapter: DomAccessibilityAdapter
  /** Defects this binding still has. An empty list is the goal. */
  knownGaps?: readonly KnownGap[]
}

const requiredSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full Name', description: 'As on your passport', minLength: 1 },
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
  },
}

// Two constraints on one field, so a single value can move from failing one
// message to failing a different one without ever becoming valid.
const twoMessageSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', title: 'Code', minLength: 4, pattern: '^[a-z]+$' },
  },
}

const readOnlySchema = {
  type: 'object',
  properties: {
    code: { type: 'string', title: 'Code', readOnly: true },
    count: { type: 'integer', title: 'Count', readOnly: true },
    bio: { type: 'string', title: 'Bio', readOnly: true },
    name: { type: 'string', title: 'Name' },
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

const IDREF_ATTRIBUTES = [
  'for',
  'aria-describedby',
  'aria-labelledby',
  'aria-controls',
  'aria-errormessage',
  'aria-owns',
]

interface Violation {
  kind: KnownGap
  detail: string
}

function idsIn(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[id]')).map((node) => node.id)
}

/**
 * Every reference a binding makes, so the contract can say that each resolves
 * and stays inside the form that made it. The id shape is deliberately not
 * asserted: uniqueness and locality are the contract, not a format.
 */
function referenceViolations(root: HTMLElement, other: HTMLElement): Violation[] {
  const out: Violation[] = []
  for (const node of root.querySelectorAll('*')) {
    for (const attribute of IDREF_ATTRIBUTES) {
      const value = node.getAttribute(attribute)
      if (!value) continue
      for (const id of value.split(/\s+/).filter(Boolean)) {
        const target = document.getElementById(id)
        if (target === null || other.contains(target)) {
          out.push({ kind: 'cross-instance-reference', detail: `${attribute}="${id}"` })
        }
      }
    }
  }
  return out
}

function duplicateViolations(first: HTMLElement, second: HTMLElement): Violation[] {
  const seen = new Set(idsIn(first))
  return idsIn(second)
    .filter((id) => seen.has(id))
    .map((id) => ({ kind: 'duplicate-id' as const, detail: id }))
}

export function rendererDomAccessibilityContract({
  adapter,
  knownGaps = [],
}: DomAccessibilityOptions): void {
  const gaps = new Set<KnownGap>(knownGaps)
  const runtimes: FormRuntime[] = []
  const surfaces: MountedSurface[] = []

  async function mount(
    schema: unknown,
    data: unknown,
    hints?: UIHints,
  ): Promise<{ surface: MountedSurface; runtime: FormRuntime; q: ReturnType<typeof within> }> {
    const port = await createJsonSchemaAdapter(schema)
    const runtime = createFormRuntime(port, { initialData: data, hints, validationDebounceMs: 0 })
    runtimes.push(runtime)
    const host = document.body.appendChild(document.createElement('div'))
    const surface = await adapter.mount({ runtime, host })
    surfaces.push(surface)
    return { surface, runtime, q: within(surface.root) }
  }

  /** The message the runtime actually produced, so the claim is not tied to wording. */
  function errorTextOf(runtime: FormRuntime, nodeId: NodeId): string {
    const errors = runtime.getNodeState(nodeId)?.errors.getSnapshot() ?? []
    const text = errors[0]?.message ?? errors[0]?.keyword
    if (!text) throw new Error('expected the runtime to have produced an error')
    return text
  }

  function nodeAt(runtime: FormRuntime, pointer: string): NodeId {
    const doc = runtime.document.getSnapshot()
    const node = Object.values(doc.nodes).find((n) => n.dataPointer === pointer)
    if (!node) throw new Error(`no node at ${pointer}`)
    return node.id
  }

  /**
   * Asserts the outcome a binding should reach, or exactly the defect it is
   * declared to still have. A binding that fails differently fails the test.
   */
  function expectGapOr(gap: KnownGap, violations: Violation[], assertClean: () => void): void {
    if (!gaps.has(gap)) {
      assertClean()
      return
    }
    expect(
      violations.map((v) => v.kind),
      `${adapter.name} is declared to have ${gap}; remove the declaration once it is fixed`,
    ).toContain(gap)
  }

  describe(`DOM accessibility contract (${adapter.name})`, () => {
    afterEach(async () => {
      while (surfaces.length > 0) await surfaces.pop()!.unmount()
      while (runtimes.length > 0) runtimes.pop()!.destroy()
      document.body.replaceChildren()
    })

    it('exposes every control by role and accessible name', async () => {
      const { q } = await mount(kindsSchema, { name: '', age: 0, agree: false, role: 'dev' })
      expect(q.getByRole('textbox', { name: 'Name' })).toBeTruthy()
      expect(q.getByRole('spinbutton', { name: 'Age' })).toBeTruthy()
      expect(q.getByRole('checkbox', { name: 'Agree' })).toBeTruthy()
      expect(q.getByRole('combobox', { name: 'Role' })).toBeTruthy()
    })

    it('exposes a field description as the control accessible description', async () => {
      const { q } = await mount(requiredSchema, { name: '', nickname: '' })
      const input = q.getByRole('textbox', { name: 'Full Name' })
      // The computed description, not a particular aria-describedby string, so
      // a binding may change its markup and still satisfy the outcome.
      expect(computeAccessibleDescription(input)).toContain('As on your passport')
    })

    it('exposes required state, and does not claim it for an optional field', async () => {
      const { q } = await mount(requiredSchema, { name: '', nickname: '' })
      expect(q.getByRole('textbox', { name: 'Full Name' }).getAttribute('aria-required')).toBe('true')
      // Absent and an explicit "false" both say not required, so either is
      // accepted; anything else is not a valid way to say it.
      expect([null, 'false']).toContain(
        q.getByRole('textbox', { name: 'Nickname' }).getAttribute('aria-required'),
      )
    })

    it('does not expose an untouched invalid field as invalid', async () => {
      const { q } = await mount(
        requiredSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      expect(q.getByRole('textbox', { name: 'Full Name' }).getAttribute('aria-invalid')).toBeNull()
    })

    it('exposes a touched invalid field and associates its error', async () => {
      const { surface, runtime, q } = await mount(
        requiredSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const input = q.getByRole('textbox', { name: 'Full Name' })
      const nameId = nodeAt(runtime, '/name')
      await surface.act(() => {
        runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
      })

      expect(input.getAttribute('aria-invalid')).toBe('true')
      // Whether the help text survives beside the error is a per renderer
      // decision that description-policy-conformance owns, so the claim here
      // is only that the error itself reaches the control.
      expect(computeAccessibleDescription(input)).toContain(errorTextOf(runtime, nameId))
    })

    it('stops exposing the error once the field becomes valid', async () => {
      const { surface, runtime, q } = await mount(
        requiredSchema,
        { name: '', nickname: '' },
        { '/name': { validationTrigger: 'blur' } },
      )
      const input = q.getByRole('textbox', { name: 'Full Name' })
      const nameId = nodeAt(runtime, '/name')
      await surface.act(() => {
        runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
      })
      expect(input.getAttribute('aria-invalid')).toBe('true')
      const errorText = errorTextOf(runtime, nameId)

      // Blur again after the edit, because this field validates on blur and a
      // value change alone deliberately does not revalidate it.
      await surface.act(() => {
        runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Alice' })
      })
      await surface.act(() => {
        runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
      })
      expect(input.getAttribute('aria-invalid')).toBeNull()
      // The stale error must leave the description, not merely stop rendering.
      expect(computeAccessibleDescription(input)).not.toContain(errorText)
    })

    it('exposes fields the user never reached after a failed submit', async () => {
      const { surface, runtime, q } = await mount(requiredSchema, { name: '', nickname: '' })
      const input = q.getByRole('textbox', { name: 'Full Name' })
      expect(input.getAttribute('aria-invalid')).toBeNull()

      await surface.act(() => {
        runtime.dispatch({ type: 'Submit' })
      })
      expect(input.getAttribute('aria-invalid')).toBe('true')
    })

    // Read-only and disabled are different states: a read-only control stays
    // focusable and selectable. Enforcement is the runtime's job and is proven
    // in core; what every renderer owes is saying which state this is.
    // Every control HTML gives a native readonly attribute, not a sample of
    // one: text, number and textarea are three separate branches in each
    // renderer, and a policy tested on one of them drifts on the others.
    // A live region has to be in the tree, and empty, before the message
    // arrives: one inserted with its content already in place is not reliably
    // announced. jsdom cannot prove an announcement, so the claim is the DOM
    // lifecycle that makes one possible, and that the same node carries every
    // update rather than being replaced.
    it('keeps one error region mounted while the message changes', async () => {
      const { surface, runtime, q } = await mount(
        twoMessageSchema,
        { code: 'ab' },
        { '/code': { validationTrigger: 'blur' } },
      )
      const codeId = nodeAt(runtime, '/code')
      const regions = () => [...surface.root.querySelectorAll('[aria-live]')]
      // Identity by node rather than through aria-describedby, because a
      // renderer may point that at a wrapper whose child is the live region.
      const spoken = () => regions().filter((r) => r.textContent !== '')

      const before = regions()
      expect(before.length, 'the region should exist before any error').toBeGreaterThan(0)
      expect(spoken(), 'nothing should be announced yet').toEqual([])
      for (const r of before) {
        expect(r.hasAttribute('hidden'), 'a hidden region is out of the tree').toBe(false)
        expect(r.getAttribute('aria-hidden')).not.toBe('true')
      }

      await surface.act(() => {
        runtime.dispatch({ type: 'SetTouched', nodeId: codeId })
      })
      const filled = spoken()
      expect(filled.length, 'the error should reach a live region').toBe(1)
      expect(before, 'the region should be one that already existed').toContain(filled[0])
      const first = filled[0]!.textContent

      // Still invalid, different message. A region that only works on first
      // appearance would pass everything above and fail here.
      await surface.act(() => {
        runtime.dispatch({ type: 'SetValue', nodeId: codeId, value: 'ABCDE' })
        runtime.dispatch({ type: 'SetTouched', nodeId: codeId })
      })
      expect(spoken(), 'the same node should carry the new message').toEqual([filled[0]])
      expect(filled[0]!.textContent).not.toBe(first)

      await surface.act(() => {
        runtime.dispatch({ type: 'SetValue', nodeId: codeId, value: 'abcde' })
        runtime.dispatch({ type: 'SetTouched', nodeId: codeId })
      })
      expect(
        surface.root.contains(filled[0]!),
        'the region should survive the field going valid',
      ).toBe(true)
      expect(filled[0]!.textContent).toBe('')
    })

    it('exposes a read-only field as read only rather than disabled', async () => {
      const { q } = await mount(
        readOnlySchema,
        { code: 'abc', count: 1, bio: 'set by the server', name: '' },
        { '/bio': { widget: 'textarea' } },
      )
      const controls = [
        q.getByRole('textbox', { name: 'Code' }),
        q.getByRole('spinbutton', { name: 'Count' }),
        q.getByRole('textbox', { name: 'Bio' }),
      ] as Array<HTMLInputElement | HTMLTextAreaElement>

      for (const control of controls) {
        expect(control.readOnly, `${control.tagName} should be read only`).toBe(true)
        expect(control.disabled, `${control.tagName} should not be disabled`).toBe(false)
      }
      expect((q.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).readOnly).toBe(false)
    })

    it('exposes a titled nested object as a named group', async () => {
      const { q } = await mount(groupedSchema, { address: { city: 'Paris' } })
      const named = q.queryAllByRole('group', { name: 'Address' })
      expectGapOr(
        'missing-named-group',
        named.length === 0 ? [{ kind: 'missing-named-group', detail: 'Address' }] : [],
        () => {
          expect(named).toHaveLength(1)
          expect(within(named[0]).getByRole('textbox', { name: 'City' })).toBeTruthy()
        },
      )
    })

    describe('relationship integrity', () => {
      it('every reference resolves inside the form that made it', async () => {
        const { surface, runtime, q } = await mount(
          requiredSchema,
          { name: '', nickname: '' },
          { '/name': { validationTrigger: 'blur' } },
        )
        await surface.act(() => {
          runtime.dispatch({ type: 'SetTouched', nodeId: nodeAt(runtime, '/name') })
        })
        expect(q.getByRole('textbox', { name: 'Full Name' }).getAttribute('aria-invalid')).toBe('true')

        for (const { attribute, id } of referencesOf(surface.root)) {
          const target = document.getElementById(id)
          expect(target, `${attribute}="${id}" should resolve`).not.toBeNull()
          expect(surface.root.contains(target), `${attribute}="${id}" points outside`).toBe(true)
        }
      })

      it('two forms of the same schema share no ids and reference only their own', async () => {
        const first = await mount(requiredSchema, { name: '', nickname: '' })
        const second = await mount(requiredSchema, { name: '', nickname: '' })

        const duplicates = duplicateViolations(first.surface.root, second.surface.root)
        const crossed = [
          ...referenceViolations(first.surface.root, second.surface.root),
          ...referenceViolations(second.surface.root, first.surface.root),
        ]

        expect(idsIn(first.surface.root).length).toBeGreaterThan(0)
        // Each diagnosis is asserted on its own, so a declaration excuses one
        // and nothing else. Folding them together let a declared duplicate id
        // silently swallow an unrelated cross-instance reference.
        expectGapOr('duplicate-id', duplicates, () => {
          expect(duplicates.map((v) => v.detail)).toEqual([])
        })
        expectGapOr('cross-instance-reference', crossed, () => {
          expect(crossed.map((v) => v.detail)).toEqual([])
        })
      })
    })

    // Texaryn's own mechanism rather than a universal requirement: the runtime
    // owns validation, so the browser must not pre-empt it. Kept separate so
    // nobody reads it as an accessibility rule.
    describe('Texaryn DOM policy', () => {
      it('marks required through ARIA and never through the native attribute', async () => {
        const { q } = await mount(requiredSchema, { name: '', nickname: '' })
        expect(q.getByRole('textbox', { name: 'Full Name' }).hasAttribute('required')).toBe(false)
      })
    })
  })
}

function referencesOf(root: HTMLElement): Array<{ attribute: string; id: string }> {
  const out: Array<{ attribute: string; id: string }> = []
  for (const node of root.querySelectorAll('*')) {
    for (const attribute of IDREF_ATTRIBUTES) {
      const value = node.getAttribute(attribute)
      if (!value) continue
      for (const id of value.split(/\s+/).filter(Boolean)) out.push({ attribute, id })
    }
  }
  return out
}
