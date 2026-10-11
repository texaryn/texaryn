import '@angular/compiler'
import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { JsonPipe } from '@angular/common'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createDocumentRuntime } from '@texaryn/core'
import type { JsonPointer, NodeId, UIDocumentV2 } from '@texaryn/core'
import { createForm, createDefaultRegistry, DocumentRoot, FormRoot } from '@texaryn/angular'
import type { AngularForm } from '@texaryn/angular'
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
    initialData: { role: 'dev', agree: true, choice: 1, objectChoice: { code: 1 } },
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
let arrayAdapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>

describe('Angular signal renderer', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
  })

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AngularSmokeHost, AngularArrayHost, AngularDocumentHost],
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
        choice: { type: ['number', 'string'], title: 'Choice', enum: [1, '1'] },
        objectChoice: { type: ['string', 'object'], title: 'Object choice', enum: [{ code: 1 }, { code: 2 }] },
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

  it('keeps read only enum and checkbox values unchanged after user events', async () => {
    const fixture = TestBed.createComponent(AngularReadOnlyHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement

    expect(select.getAttribute('aria-readonly')).toBe('true')
    expect(checkbox.getAttribute('aria-readonly')).toBe('true')

    select.value = 'pm'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()

    expect(fixture.componentInstance.form.data()).toEqual({
      role: 'dev',
      agree: true,
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
