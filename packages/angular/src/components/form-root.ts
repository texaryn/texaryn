import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
} from '@angular/core'
import type { FormMessages, RendererRegistry } from '@texaryn/core'
import { FORM_CONTEXT } from '../context.js'
import type { FormContext } from '../context.js'
import type { AngularForm } from '../form.js'
import type { WidgetComponent } from '../widget.js'
import { ErrorSummary } from './error-summary.js'
import { NodeRenderer } from './node-renderer.js'

@Component({
  selector: 'texaryn-form-root',
  standalone: true,
  imports: [ErrorSummary, NodeRenderer],
  providers: [{ provide: FORM_CONTEXT, useExisting: forwardRef(() => FormRoot) }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showErrorSummary()) {
      <texaryn-error-summary
        [form]="form()"
        [idPrefix]="idPrefix()"
        [messages]="messages()"
        [focus]="summaryFocus()"
      />
    }
    @let document = form().document();
    @if (document.nodes[document.rootId]; as root) {
      <texaryn-node-renderer [node]="root" />
    }
  `,
})
export class FormRoot implements FormContext {
  readonly form = input.required<AngularForm>()
  readonly registry = input.required<RendererRegistry<WidgetComponent>>()
  readonly messages = input<FormMessages | undefined>(undefined)
  readonly idPrefix = input.required<string>()
  readonly showErrorSummary = input(false)
  readonly summaryFocus = input(true)
}
