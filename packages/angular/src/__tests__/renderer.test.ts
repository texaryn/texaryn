import '@angular/compiler'
import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { JsonPipe } from '@angular/common'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createDocumentRuntime } from '@texaryn/core'
import type { JsonPointer, NodeId, RendererRegistry, Store, UIDocument, UIDocumentV2, UINode } from '@texaryn/core'
import { createForm, createDefaultRegistry, DocumentRoot, FORM_CONTEXT, FormRoot, useDynamicStore, useFieldArray } from '@texaryn/angular'
import type { AngularForm } from '@texaryn/angular'
import { createStore } from '@texaryn/core'
import type { FormContext } from '@texaryn/angular'
import type { WidgetComponent } from '@texaryn/angular'
import { angularAdapter } from './angular-adapter.js'
import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { createArrayDragTransfer, dispatchArrayDrag } from '../../../../tests/renderer-conformance/array-drag.js'

@Component({
  selector: 'texaryn-angular-smoke-host',
  standalone: true,
  imports: [FormRoot, JsonPipe],
  template: `
    <texaryn-form-root
      [form]="form"
      [registry]="registry"
      idPrefix="smoke"
    />
    <pre data-testid="form-data">{{ form.data() | json }}</pre>
  `,
})
class AngularSmokeHost {
  readonly form = createForm(adapter, { initialData: { name: '' } })
  readonly registry = createDefaultRegistry()
}

@Component({
  selector: 'texaryn-angular-read-only-host',
  standalone: true,
  imports: [FormRoot],
  template: `
    <texaryn-form-root
      [form]="form"
      [registry]="registry"
      idPrefix="read-only"
    />
  `,
})
class AngularReadOnlyHost {
  readonly form = createForm(readOnlyAdapter, {
    initialData: { role: 'dev', agree: true, locked: 'fixed', choice: 1, objectChoice: { code: 1 } },
  })
  readonly registry = createDefaultRegistry()
}

@Component({
  selector: 'texaryn-angular-array-host',
  standalone: true,
  imports: [FormRoot],
  template: '<texaryn-form-root [form]="form" [registry]="registry" idPrefix="array" />',
})
class AngularArrayHost {
  readonly form = createForm(arrayAdapter, {
    initialData: { people: ['Ada', 'Grace', 'Lin'] },
    hints: { '/people': { canReorder: true } },
  })
  readonly registry = createDefaultRegistry()
}

@Component({
  selector: 'texaryn-angular-coverage-host',
  standalone: true,
  imports: [FormRoot],
  template: `
    <texaryn-form-root
      [form]="form"
      [registry]="registry"
      idPrefix="coverage"
      [showErrorSummary]="true"
      [summaryFocus]="true"
    />
  `,
})
class AngularCoverageHost {
  readonly form = createForm(coverageAdapter, {
    initialData: {
      name: '',
      bio: '',
      age: 0,
      active: false,
      role: 'dev',
      metadata: { note: 'Note' },
      tags: ['one', 'two'],
    },
    hints: {
      '/bio': { widget: 'textarea', placeholder: 'Biography', helpText: 'Add a short summary.' },
      '/tags': { canReorder: true },
    },
  })
  readonly registry = createDefaultRegistry()
}

@Component({
  selector: 'texaryn-angular-empty-registry-host',
  standalone: true,
  imports: [FormRoot],
  template: `
    <texaryn-form-root [form]="form" [registry]="registry" idPrefix="empty-registry" />
  `,
})
class AngularEmptyRegistryHost {
  readonly form = createForm(adapter)
  readonly registry: RendererRegistry<WidgetComponent> = {
    resolve: (_node: UINode) => undefined,
  }
}

@Component({
  selector: 'texaryn-angular-dynamic-store-host',
  standalone: true,
  template: '',
})
class AngularDynamicStoreHost {
  readonly source = signal<Store<number> | undefined>(undefined)
  readonly value = useDynamicStore(() => this.source(), -1)
}

function displayDocument(): UIDocumentV2 {
  const nodeId = (value: string) => value as NodeId
  const pointer = (value: string) => value as JsonPointer
  return {
    version: 2,
    rootId: nodeId('root'),
    nodes: {
      root: { id: nodeId('root'), type: 'container', parentId: null, annotations: { title: 'People' }, containerType: 'group', children: [nodeId('heading'), nodeId('list'), nodeId('table'), nodeId('action')] },
      heading: { id: nodeId('heading'), type: 'text', parentId: nodeId('root'), annotations: {}, textRole: 'heading', content: 'Directory' },
      list: { id: nodeId('list'), type: 'list', parentId: nodeId('root'), annotations: {}, collectionId: 'people-list', dataPointer: pointer('/people'), valuePointer: pointer('/name'), rowKeyPointer: pointer('/id') },
      table: { id: nodeId('table'), type: 'table', parentId: nodeId('root'), annotations: {}, collectionId: 'people-table', dataPointer: pointer('/people'), rowKeyPointer: pointer('/id'), columns: [{ id: 'name', label: 'Name', valuePointer: pointer('/name') }] },
      action: { id: nodeId('action'), type: 'action', parentId: nodeId('root'), annotations: {}, actionType: 'refresh', label: 'Refresh', buttonRole: 'button' },
    },
  }
}

const refresh = vi.fn()

@Component({
  selector: 'texaryn-angular-display-host',
  standalone: true,
  imports: [DocumentRoot],
  template: '<texaryn-document-root [runtime]="runtime" />',
})
class AngularDocumentHost {
  readonly runtime = createDocumentRuntime(displayDocument(), {
    initialData: { people: [{ id: 'ada', name: 'Ada' }] },
    actions: { refresh },
  })
}

let adapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>
let readOnlyAdapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>
let coverageAdapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>
let arrayAdapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>

describe('Angular signal renderer', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
  })

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        AngularSmokeHost,
        AngularReadOnlyHost,
        AngularCoverageHost,
        AngularEmptyRegistryHost,
        AngularDynamicStoreHost,
        AngularDocumentHost,
        AngularArrayHost,
      ],
      providers: [provideZonelessChangeDetection()],
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  rendererDomAccessibilityContract({ adapter: angularAdapter('angular') })

  beforeAll(async () => {
    adapter = await createJsonSchemaAdapter({
      type: 'object',
      properties: { name: { type: 'string', title: 'Name' } },
    })
    readOnlyAdapter = await createJsonSchemaAdapter({
      type: 'object',
      properties: {
        role: { type: 'string', title: 'Role', enum: ['dev', 'pm'], readOnly: true },
        agree: { type: 'boolean', title: 'Agree', readOnly: true },
        locked: { type: 'string', title: 'Locked', readOnly: true },
        choice: { type: ['number', 'string'], title: 'Choice', enum: [1, '1'] },
        objectChoice: { type: ['string', 'object'], title: 'Object choice', enum: [{ code: 1 }, { code: 2 }] },
      },
    })
    coverageAdapter = await createJsonSchemaAdapter({
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', title: 'Name', minLength: 1 },
        bio: { type: 'string', title: 'Biography' },
        age: { type: 'integer', title: 'Age' },
        active: { type: 'boolean', title: 'Active' },
        role: { type: 'string', title: 'Role', enum: ['dev', 'pm'] },
        metadata: {
          type: 'object',
          title: 'Metadata',
          properties: { note: { type: 'string', title: 'Note' } },
        },
        tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
      },
    })
    arrayAdapter = await createJsonSchemaAdapter({
      type: 'object',
      properties: { people: { type: 'array', items: { type: 'string' } } },
    })
  })

  it('binds store updates to standalone components in zoneless change detection', async () => {
    const fixture = TestBed.createComponent(AngularSmokeHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement

    input.value = 'Ada'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await fixture.whenStable()

    expect(fixture.nativeElement.querySelector('[data-testid="form-data"]')?.textContent).toContain('"name": "Ada"')
    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('keeps read only enum and checkbox values unchanged after user events', async () => {
    const fixture = TestBed.createComponent(AngularReadOnlyHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement
    const locked = fixture.nativeElement.querySelector('input[name="/locked"]') as HTMLInputElement

    expect(select.getAttribute('aria-readonly')).toBe('true')
    expect(checkbox.getAttribute('aria-readonly')).toBe('true')

    select.value = 'pm'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    locked.value = 'changed'
    locked.dispatchEvent(new Event('input', { bubbles: true }))
    await fixture.whenStable()

    expect(fixture.componentInstance.form.data()).toEqual({
      role: 'dev',
      agree: true,
      locked: 'fixed',
      choice: 1,
      objectChoice: { code: 1 },
    })
    expect(select.value).toBe('texaryn-enum-0')
    expect(checkbox.checked).toBe(true)

    const choice = fixture.nativeElement.querySelector('select[name="/choice"]') as HTMLSelectElement
    expect(choice.value).toBe('texaryn-enum-0')
    expect(choice.querySelectorAll('option')[1]?.value).toBe('texaryn-enum-0')
    expect(choice.querySelectorAll('option')[2]?.value).toBe('texaryn-enum-1')
    choice.value = 'texaryn-enum-1'
    choice.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()
    expect(fixture.componentInstance.form.data()).toMatchObject({ choice: '1' })

    const objectChoice = fixture.nativeElement.querySelector('select[name="/objectChoice"]') as HTMLSelectElement
    expect(objectChoice.value).toBe('texaryn-enum-0')
    objectChoice.value = 'texaryn-enum-1'
    objectChoice.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()
    expect(fixture.componentInstance.form.data()).toMatchObject({ objectChoice: { code: 2 } })

    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('renders and updates scalar widgets, nested layouts, and array rows', async () => {
    const fixture = TestBed.createComponent(AngularCoverageHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()

    const bio = fixture.nativeElement.querySelector('textarea[name="/bio"]') as HTMLTextAreaElement
    expect(bio.placeholder).toBe('Biography')
    expect(fixture.nativeElement.textContent).toContain('Add a short summary.')
    expect(fixture.nativeElement.querySelector('fieldset legend')?.textContent).toBe('Metadata')
    expect(fixture.nativeElement.querySelector('input[name="/name"]')?.getAttribute('aria-required')).toBe('true')

    bio.value = 'About Ada'
    bio.dispatchEvent(new Event('input', { bubbles: true }))
    bio.dispatchEvent(new Event('blur', { bubbles: true }))
    const age = fixture.nativeElement.querySelector('input[name="/age"]') as HTMLInputElement
    age.value = ''
    age.dispatchEvent(new Event('input', { bubbles: true }))
    age.value = '42'
    age.dispatchEvent(new Event('input', { bubbles: true }))
    const active = fixture.nativeElement.querySelector('input[name="/active"]') as HTMLInputElement
    active.checked = true
    active.dispatchEvent(new Event('change', { bubbles: true }))
    const role = fixture.nativeElement.querySelector('select[name="/role"]') as HTMLSelectElement
    role.value = 'texaryn-enum-1'
    role.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()

    expect(fixture.componentInstance.form.data()).toMatchObject({
      bio: 'About Ada',
      age: 42,
      active: true,
      role: 'pm',
    })

    role.value = 'unknown-option'
    role.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()
    expect(fixture.componentInstance.form.data()).toMatchObject({ role: '' })

    const firstRow = fixture.nativeElement.querySelector('[data-array-row]') as HTMLElement
    const moveDown = firstRow.querySelector('[data-reorder-direction="down"]') as HTMLButtonElement
    moveDown.focus()
    moveDown.click()
    await fixture.whenStable()
    expect(fixture.componentInstance.form.data()).toMatchObject({ tags: ['two', 'one'] })
    expect(document.activeElement?.getAttribute('data-reorder-direction')).toBe('up')

    const add = fixture.nativeElement.querySelector('button[aria-label="Add item to Tags"]') as HTMLButtonElement
    add.click()
    await fixture.whenStable()
    expect(fixture.componentInstance.form.data()).toMatchObject({ tags: ['two', 'one', null] })

    const remove = fixture.nativeElement.querySelector('button[aria-label^="Remove Tag"]') as HTMLButtonElement
    remove.click()
    await fixture.whenStable()
    expect(fixture.componentInstance.form.data()).toMatchObject({ tags: ['one', null] })

    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('reorders the selected stable row with native drag events', async () => {
    const fixture = TestBed.createComponent(AngularArrayHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const root = fixture.nativeElement.querySelector('[data-array-container]') as HTMLElement
    expect(root, fixture.nativeElement.innerHTML).not.toBeNull()
    const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
    const transfer = createArrayDragTransfer()
    const handle = rows[1]!.querySelector<HTMLElement>('[draggable="true"]')!
    expect(handle.tabIndex).toBe(-1)
    expect(handle.getAttribute('aria-hidden')).toBe('true')
    rows[0]!.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 } as DOMRect)

    dispatchArrayDrag('dragstart', handle, transfer)
    dispatchArrayDrag('dragover', rows[0]!, transfer, 10)
    dispatchArrayDrag('drop', rows[0]!, transfer, 10)
    await fixture.whenStable()

    expect(fixture.componentInstance.form.data()).toEqual({ people: ['Grace', 'Ada', 'Lin'] })
    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('ignores missing payloads and stale targets without a drag session', async () => {
    const fixture = TestBed.createComponent(AngularArrayHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const root = fixture.nativeElement.querySelector('[data-array-container]') as HTMLElement
    const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
    const emptyTransfer = createArrayDragTransfer()
    dispatchArrayDrag('dragover', rows[0]!, emptyTransfer)
    dispatchArrayDrag('drop', rows[0]!, emptyTransfer)

    const staleTransfer = createArrayDragTransfer()
    staleTransfer.setData('application/x-texaryn-array-item', 'removed-item')
    dispatchArrayDrag('dragover', rows[0]!, staleTransfer)
    expect(rows[0]!.hasAttribute('data-drop-target')).toBe(false)
    rows[0]!.setAttribute('data-drop-target', '')
    dispatchArrayDrag('dragleave', rows[0]!, staleTransfer)
    expect(rows[0]!.hasAttribute('data-drop-target')).toBe(false)
    dispatchArrayDrag('drop', rows[0]!, staleTransfer)

    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('shows and focuses the error summary after an invalid submit', async () => {
    const fixture = TestBed.createComponent(AngularCoverageHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('section[aria-labelledby]')).toBeNull()

    fixture.componentInstance.form.dispatch({ type: 'Submit' })
    await fixture.whenStable()
    fixture.detectChanges()

    const summary = fixture.nativeElement.querySelector('section[aria-labelledby]') as HTMLElement
    expect(summary.textContent).toContain('Name')
    const href = summary.querySelector('a')?.getAttribute('href')
    expect(fixture.nativeElement.querySelector(href)?.id).toBe(href?.slice(1))
    expect(document.activeElement).toBe(summary)

    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('renders no widget when a registry does not resolve the root node', async () => {
    const fixture = TestBed.createComponent(AngularEmptyRegistryHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('input, textarea, select')).toBeNull()
    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('returns empty array actions when the hook does not resolve an array node', () => {
    const document: UIDocument = {
      version: 1,
      rootId: 'root' as NodeId,
      nodes: {},
    }
    const form = { document: signal(document) } as unknown as AngularForm
    const context: FormContext = {
      form: signal(form),
      registry: signal(createDefaultRegistry()),
      messages: signal(undefined),
      idPrefix: signal('array-test'),
    }
    TestBed.overrideProvider(FORM_CONTEXT, { useValue: context })

    const array = TestBed.runInInjectionContext(() => useFieldArray(() => 'missing' as NodeId))
    expect(array.items()).toEqual([])
    expect(array.canAdd()).toBe(false)
    expect(array.canRemove()).toBe(false)
    expect(array.canReorder()).toBe(false)
  })

  it('uses a fallback while a dynamic store is missing and follows store updates', async () => {
    const fixture = TestBed.createComponent(AngularDynamicStoreHost)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.value()).toBe(-1)

    const store = createStore(1)
    fixture.componentInstance.source.set(store)
    await fixture.whenStable()
    expect(fixture.componentInstance.value()).toBe(1)

    store.set(2)
    await fixture.whenStable()
    expect(fixture.componentInstance.value()).toBe(2)

    fixture.componentInstance.source.set(undefined)
    await fixture.whenStable()
    expect(fixture.componentInstance.value()).toBe(-1)
    fixture.destroy()
  })

  it('renders non-form nodes and subscribes to collection stores', async () => {
    refresh.mockClear()
    const fixture = TestBed.createComponent(AngularDocumentHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()

    expect(fixture.nativeElement.querySelector('fieldset legend')?.textContent).toBe('People')
    expect(fixture.nativeElement.querySelector('h2')?.textContent).toBe('Directory')
    expect(fixture.nativeElement.querySelector('ul li')?.textContent).toBe('Ada')
    expect(fixture.nativeElement.querySelector('td')?.textContent).toBe('Ada')

    fixture.componentInstance.runtime.setData({ people: [{ id: 'grace', name: 'Grace' }] })
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('ul li')?.textContent).toBe('Grace')
    fixture.nativeElement.querySelector('button')?.click()
    await fixture.whenStable()
    expect(refresh).toHaveBeenCalledOnce()

    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('disables action nodes without a registered host handler', async () => {
    const runtime = createDocumentRuntime(displayDocument(), { initialData: { people: [] } })
    const fixture = TestBed.createComponent(DocumentRoot)
    fixture.componentRef.setInput('runtime', runtime)
    fixture.autoDetectChanges()
    await fixture.whenStable()

    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toBe(true)

    fixture.destroy()
    runtime.destroy()
  })
})
