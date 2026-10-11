import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core'
import type { UINode } from '@texaryn/core'
import { useFieldWidget } from '../use-field-widget.js'

@Component({
  selector: 'texaryn-field-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <label [id]="field.labelFor() + '-label'" [attr.for]="field.labelFor()">@if (field.aria()['aria-required'] && requiredIndicator().placement === 'before') {<span aria-hidden="true">{{ requiredIndicator().text }} </span>}<span>{{ field.label() }}</span>@if (field.aria()['aria-required'] && requiredIndicator().placement === 'after') {<span aria-hidden="true"> {{ requiredIndicator().text }}</span>}</label>
      @switch (field.kind()) {
        @case ('enum') {
          <select
            [id]="field.aria().id"
            [name]="field.aria().name"
            [disabled]="field.aria().disabled"
            [attr.aria-readonly]="field.aria()['aria-readonly'] ? 'true' : null"
            [attr.aria-required]="field.aria()['aria-required'] ? 'true' : null"
            [attr.aria-invalid]="field.aria()['aria-invalid'] ? 'true' : null"
            [attr.aria-describedby]="field.aria()['aria-describedby'] ?? null"
            (change)="onSelectChange($event)"
            (blur)="field.onBlur()"
          >
            <option value="" [selected]="enumValueToken() === ''"></option>
            @for (option of enumOptions(); track option.token) {
              <option [value]="option.token" [selected]="enumValueToken() === option.token">
                {{ option.label }}
              </option>
            }
          </select>
        }
        @case ('boolean') {
          <input
            [id]="field.aria().id"
            [name]="field.aria().name"
            type="checkbox"
            [checked]="!!field.value()"
            [disabled]="field.aria().disabled"
            [attr.aria-readonly]="field.aria()['aria-readonly'] ? 'true' : null"
            [attr.aria-required]="field.aria()['aria-required'] ? 'true' : null"
            [attr.aria-invalid]="field.aria()['aria-invalid'] ? 'true' : null"
            [attr.aria-describedby]="field.aria()['aria-describedby'] ?? null"
            (change)="onCheckboxChange($event)"
            (blur)="field.onBlur()"
          />
        }
        @case ('number') {
          <input
            [id]="field.aria().id"
            [name]="field.aria().name"
            type="number"
            [value]="field.display()"
            [disabled]="field.aria().disabled"
            [readOnly]="field.node().readOnly"
            [attr.aria-required]="field.aria()['aria-required'] ? 'true' : null"
            [attr.aria-invalid]="field.aria()['aria-invalid'] ? 'true' : null"
            [attr.aria-describedby]="field.aria()['aria-describedby'] ?? null"
            [attr.placeholder]="field.aria().placeholder ?? null"
            (input)="field.setRaw($any($event.target).value)"
            (blur)="field.onBlur()"
          />
        }
        @default {
          @if (field.node().widget === 'textarea') {
            <textarea
              [id]="field.aria().id"
              [name]="field.aria().name"
              [value]="field.display()"
              [disabled]="field.aria().disabled"
              [readOnly]="field.node().readOnly"
              [attr.aria-required]="field.aria()['aria-required'] ? 'true' : null"
              [attr.aria-invalid]="field.aria()['aria-invalid'] ? 'true' : null"
              [attr.aria-describedby]="field.aria()['aria-describedby'] ?? null"
              [attr.placeholder]="field.aria().placeholder ?? null"
              (input)="field.setRaw($any($event.target).value)"
              (blur)="field.onBlur()"
            ></textarea>
          } @else {
            <input
              [id]="field.aria().id"
              [name]="field.aria().name"
              type="text"
              [value]="field.display()"
              [disabled]="field.aria().disabled"
              [readOnly]="field.node().readOnly"
              [attr.aria-required]="field.aria()['aria-required'] ? 'true' : null"
              [attr.aria-invalid]="field.aria()['aria-invalid'] ? 'true' : null"
              [attr.aria-describedby]="field.aria()['aria-describedby'] ?? null"
              [attr.placeholder]="field.aria().placeholder ?? null"
              (input)="field.setRaw($any($event.target).value)"
              (blur)="field.onBlur()"
            />
          }
        }
      }
      @if (field.description(); as description) {
        <div [id]="field.descriptionId()">{{ description }}</div>
      }
      <div [id]="field.errorId()" aria-live="polite" aria-atomic="true">
        @for (error of field.errors(); track $index) {
          <div>{{ error.message ?? error.keyword }}</div>
        }
      </div>
    </div>
  `,
})
export class FieldWidgetComponent {
  readonly node = input.required<UINode>()
  readonly field = useFieldWidget(this.node)
  readonly requiredIndicator = computed(() => this.field.messages().requiredIndicator())
  readonly enumOptions = computed(() =>
    (this.field.node().enumValues ?? []).map((option, index) => ({
      token: `texaryn-enum-${index}`,
      value: option.value,
      label: option.title ?? this.stringify(option.value),
    })),
  )
  readonly enumValueToken = computed(() =>
    this.enumOptions().find((option) => sameJsonValue(option.value, this.field.value()))?.token ?? '',
  )
  readonly stringify = (value: unknown): string => {
    if (typeof value === 'string') return value
    return JSON.stringify(value) ?? String(value)
  }

  onSelectChange(event: Event): void {
    const control = event.target as HTMLSelectElement
    const option = this.enumOptions().find((candidate) => candidate.token === control.value)
    this.field.setValue(option ? option.value : '')
    if (this.field.node().readOnly) control.value = this.enumValueToken()
  }

  onCheckboxChange(event: Event): void {
    const control = event.target as HTMLInputElement
    this.field.setValue(control.checked)
    if (this.field.node().readOnly) control.checked = Boolean(this.field.value())
  }
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameJsonValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && sameJsonValue(leftRecord[key], rightRecord[key]))
}
