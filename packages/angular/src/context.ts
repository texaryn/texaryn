import { inject, InjectionToken } from '@angular/core'
import type { Signal } from '@angular/core'
import type { FormMessages, RendererRegistry } from '@texaryn/core'
import type { AngularForm } from './form.js'
import type { WidgetComponent } from './widget.js'

export interface FormContext {
  readonly form: Signal<AngularForm>
  readonly registry: Signal<RendererRegistry<WidgetComponent>>
  readonly messages: Signal<FormMessages | undefined>
  readonly idPrefix: Signal<string>
}

export const FORM_CONTEXT = new InjectionToken<FormContext>('texaryn.angular.form-context')

export function useFormContext(): FormContext {
  return inject(FORM_CONTEXT)
}
