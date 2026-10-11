import '@angular/compiler'
import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { JsonPipe } from '@angular/common'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createForm, createDefaultRegistry, FormRoot } from '@texaryn/angular'
import type { AngularForm } from '@texaryn/angular'
import { angularAdapter } from './angular-adapter.js'
import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'

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

let adapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>
let readOnlyAdapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>

describe('Angular signal renderer', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
  })

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AngularSmokeHost],
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
})
