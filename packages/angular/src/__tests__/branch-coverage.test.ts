import '@angular/compiler'
import { Component, provideZonelessChangeDetection, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { ArrayControl, createDefaultRegistry, createForm, FieldWidgetComponent, FORM_CONTEXT, FormRoot, ObjectLayout } from '@texaryn/angular'
import type { AngularForm, ArrayControl as ArrayControlType, FormContext } from '@texaryn/angular'
import { createStore } from '@texaryn/core'
import type { ContainerNode, FieldNode, FormMessages, JsonPointer, NodeId, NodeState, UIDocument, UINode } from '@texaryn/core'
import { fieldAria, fieldLabel } from '../field-props.js'

const boundaryDispatch = vi.fn()
const boundaryNode = {
  id: 'boundary-root' as NodeId,
  type: 'container',
  containerType: 'object',
  parentId: null,
  dataPointer: '' as JsonPointer,
  order: 0,
  visible: true,
  disabled: false,
  readOnly: false,
  annotations: { title: 'Profile' },
  children: ['boundary-child' as NodeId, 'missing-child' as NodeId],
  boundaryTargets: [
    { pointer: '/child' as JsonPointer, reason: 'recursion', token: 'recursive-first' },
    { pointer: '/next' as JsonPointer, reason: 'recursion', token: 'recursive-second' },
    { pointer: '/items' as JsonPointer, reason: 'budget', token: 'budget-first' },
  ],
} as ContainerNode
const boundaryChild = {
  id: 'boundary-child' as NodeId,
  type: 'text',
  parentId: boundaryNode.id,
  dataPointer: null,
  order: 0,
  visible: true,
  disabled: false,
  readOnly: false,
  annotations: {},
  content: 'A child',
  textRole: 'paragraph',
} as unknown as UINode
const boundaryDocument = {
  version: 1,
  rootId: boundaryNode.id,
  nodes: { [boundaryNode.id]: boundaryNode, [boundaryChild.id]: boundaryChild },
} as UIDocument
const boundaryForm = {
  document: signal(boundaryDocument),
  dispatch: boundaryDispatch,
} as unknown as AngularForm
const boundaryContext: FormContext = {
  form: signal(boundaryForm),
  registry: signal(createDefaultRegistry()),
  messages: signal({} as FormMessages),
  idPrefix: signal('boundary'),
}

@Component({
  selector: 'texaryn-angular-boundary-host',
  standalone: true,
  imports: [ObjectLayout],
  providers: [{ provide: FORM_CONTEXT, useValue: boundaryContext }],
  template: '<texaryn-object-layout [node]="node" />',
})
class BoundaryHost {
  readonly node: UINode = boundaryNode
}

@Component({
  selector: 'texaryn-angular-root-visibility-host',
  standalone: true,
  imports: [FormRoot],
  template: '<texaryn-form-root [form]="form" [registry]="registry" idPrefix="visibility" />',
})
class RootVisibilityHost {
  readonly document = signal<UIDocument>({
    version: 1,
    rootId: 'root' as NodeId,
    nodes: {},
  })
  readonly form = { document: this.document } as unknown as AngularForm
  readonly registry = createDefaultRegistry()
}

const arrayNode = {
  id: 'array-root' as NodeId,
  type: 'container',
  containerType: 'array',
  parentId: null,
  dataPointer: '/items' as JsonPointer,
  order: 0,
  visible: true,
  disabled: false,
  readOnly: false,
  annotations: { title: 'Items' },
  children: [],
  arrayMeta: {
    itemIds: [],
    identityKey: 'items-identity',
    canAdd: false,
    canRemove: false,
    canReorder: false,
  },
} as unknown as ContainerNode
const arrayContext: FormContext = {
  form: signal({
    document: signal({ version: 1, rootId: arrayNode.id, nodes: {} } as UIDocument),
  } as unknown as AngularForm),
  registry: signal(createDefaultRegistry()),
  messages: signal(undefined),
  idPrefix: signal('array-fallback'),
}

@Component({
  selector: 'texaryn-angular-array-fallback-host',
  standalone: true,
  imports: [ArrayControl],
  providers: [{ provide: FORM_CONTEXT, useValue: arrayContext }],
  template: '<texaryn-array-control [node]="node" />',
})
class ArrayFallbackHost {
  readonly node: UINode = arrayNode
}

let focusAdapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>

@Component({
  selector: 'texaryn-angular-summary-no-focus-host',
  standalone: true,
  imports: [FormRoot],
  template: `
    <texaryn-form-root
      [form]="form"
      [registry]="registry"
      idPrefix="no-focus"
      [showErrorSummary]="true"
      [summaryFocus]="false"
    />
  `,
})
class SummaryNoFocusHost {
  readonly form = createForm(focusAdapter, { initialData: { name: '' } })
  readonly registry = createDefaultRegistry()
}

const mixedValue = createStore<unknown>(['one'])
const mixedField = {
  id: 'shape' as NodeId,
  type: 'field',
  fieldType: 'string',
  parentId: null,
  dataPointer: '/shape' as JsonPointer,
  order: 0,
  visible: true,
  disabled: false,
  readOnly: false,
  annotations: { title: 'Shape' },
  constraints: {},
  enumValues: [
    { value: ['one'] },
    { value: { code: 'one' } },
    { value: { other: 'one' } },
    { value: { code: 'one', other: true } },
  ],
} as unknown as FieldNode
const mixedNodeState: NodeState = {
  value: mixedValue,
  errors: createStore([]),
  dirty: createStore(false),
  touched: createStore(false),
  visible: createStore(true),
  disabled: createStore(false),
  validationStatus: createStore<'idle' | 'pending' | 'valid' | 'invalid'>('valid'),
  showErrors: createStore(false),
}
const mixedDispatch = vi.fn((command: { type: string; value?: unknown }) => {
  if (command.type === 'SetValue') mixedValue.set(command.value)
})
const mixedForm = {
  document: signal({ version: 1, rootId: mixedField.id, nodes: { [mixedField.id]: mixedField } } as UIDocument),
  getNodeState: () => mixedNodeState,
  dispatch: mixedDispatch,
} as unknown as AngularForm
const mixedContext: FormContext = {
  form: signal(mixedForm),
  registry: signal(createDefaultRegistry()),
  messages: signal(undefined),
  idPrefix: signal('mixed-enum'),
}

@Component({
  selector: 'texaryn-angular-mixed-enum-host',
  standalone: true,
  imports: [FieldWidgetComponent],
  providers: [{ provide: FORM_CONTEXT, useValue: mixedContext }],
  template: '<texaryn-field-widget [node]="node" />',
})
class MixedEnumHost {
  readonly node: UINode = mixedField
}

describe('Angular branch coverage', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
  })

  beforeAll(async () => {
    focusAdapter = await createJsonSchemaAdapter({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1, title: 'Name' } },
    })
  })

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BoundaryHost, RootVisibilityHost, ArrayFallbackHost, SummaryNoFocusHost, MixedEnumHost],
      providers: [provideZonelessChangeDetection()],
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders one expansion action per boundary reason and dispatches its token', async () => {
    boundaryDispatch.mockClear()
    const fixture = TestBed.createComponent(BoundaryHost)
    fixture.autoDetectChanges()
    await fixture.whenStable()

    const actions = fixture.nativeElement.querySelectorAll('button')
    expect(actions).toHaveLength(2)
    expect(fixture.nativeElement.querySelectorAll('texaryn-node-renderer')).toHaveLength(1)
    actions[0].click()
    expect(boundaryDispatch).toHaveBeenCalledWith({
      type: 'ExpandBoundary',
      containerId: boundaryNode.id,
      targetToken: 'recursive-first',
    })

    boundaryForm.document.set({ version: 1, rootId: boundaryNode.id, nodes: {} })
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(2)

    fixture.destroy()
  })

  it('omits missing and invisible root nodes', async () => {
    const fixture = TestBed.createComponent(RootVisibilityHost)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('input')).toBeNull()

    const hiddenField = {
      id: 'root' as NodeId,
      type: 'field',
      fieldType: 'string',
      parentId: null,
      dataPointer: '/name' as JsonPointer,
      order: 0,
      visible: false,
      disabled: false,
      readOnly: false,
      annotations: {},
      constraints: {},
    } as unknown as UINode
    fixture.componentInstance.document.set({ version: 1, rootId: hiddenField.id, nodes: { root: hiddenField } })
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('input')).toBeNull()

    fixture.destroy()
  })

  it('keeps focus on the field when the summary is configured not to focus', async () => {
    const fixture = TestBed.createComponent(SummaryNoFocusHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const field = fixture.nativeElement.querySelector('input[name="/name"]') as HTMLInputElement
    field.focus()
    fixture.componentInstance.form.dispatch({ type: 'Submit' })
    await fixture.whenStable()

    expect(fixture.nativeElement.querySelector('section[aria-labelledby]')).not.toBeNull()
    expect(document.activeElement).toBe(field)

    fixture.destroy()
    fixture.nativeElement.remove()
  })

  it('falls back to its node input when the form document lacks an array', async () => {
    const fixture = TestBed.createComponent(ArrayFallbackHost)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const component = fixture.debugElement.query(By.directive(ArrayControl)).componentInstance as ArrayControlType

    expect(component.currentArray()).toBe(arrayNode)
    expect(component.itemTitle(undefined)).toBeUndefined()
    expect(component.itemTitle('missing')).toBeUndefined()

    const form = arrayContext.form()
    const nodeWithoutMeta = { ...arrayNode, arrayMeta: undefined } as unknown as UINode
    form.document.set({ version: 1, rootId: arrayNode.id, nodes: { [arrayNode.id]: nodeWithoutMeta } } as UIDocument)
    await fixture.whenStable()
    expect(component.array.items()).toEqual([])
    expect(component.array.canAdd()).toBe(false)

    fixture.destroy()
  })

  it('preserves empty titles and falls back from null data pointers', () => {
    const field = {
      id: 'label' as NodeId,
      type: 'field',
      fieldType: 'string',
      dataPointer: null,
      annotations: { title: '' },
      constraints: {},
    } as unknown as FieldNode

    expect(fieldLabel(field)).toBe('Field')
    expect(fieldLabel({ ...field, annotations: { title: null } } as unknown as FieldNode)).toBe('Field')
    expect(fieldAria({ ...field, annotations: { title: undefined } } as unknown as FieldNode, {
      disabled: false,
      showErrors: false,
      errors: [],
    }, 'label').name).toBe('label')
  })

  it('matches array and object enum values by their JSON structure', async () => {
    const fixture = TestBed.createComponent(MixedEnumHost)
    document.body.append(fixture.nativeElement)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    const select = fixture.nativeElement.querySelector('select[name="/shape"]') as HTMLSelectElement
    expect(select.value).toBe('texaryn-enum-0')

    select.value = 'texaryn-enum-1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()
    expect(mixedValue.getSnapshot()).toEqual({ code: 'one' })
    expect(select.value).toBe('texaryn-enum-1')

    select.value = 'texaryn-enum-2'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()
    expect(mixedValue.getSnapshot()).toEqual({ other: 'one' })

    select.value = 'texaryn-enum-3'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await fixture.whenStable()
    expect(mixedValue.getSnapshot()).toEqual({ code: 'one', other: true })
    expect(select.value).toBe('texaryn-enum-3')
    expect(mixedDispatch).toHaveBeenCalledTimes(3)

    fixture.destroy()
    fixture.nativeElement.remove()
  })
})
