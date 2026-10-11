import { ApplicationRef, EnvironmentInjector, createComponent } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { FormMessages, FormRuntime, RendererRegistry } from '@texaryn/core'
import { bindFormRuntime, FormRoot, createDefaultRegistry } from '@texaryn/angular'
import type { AngularForm, WidgetComponent } from '@texaryn/angular'
import type { DomAccessibilityAdapter } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'

export function angularAdapter(name: string): DomAccessibilityAdapter {
  let app = 0
  return {
    name,
    async mount({ runtime, host, messages, summary }) {
      const form = TestBed.runInInjectionContext(() => bindFormRuntime(runtime))
      const application = TestBed.inject(ApplicationRef)
      const component = createComponent(AngularTestHost, {
        environmentInjector: TestBed.inject(EnvironmentInjector),
        hostElement: document.createElement('div'),
      })
      app += 1
      component.setInput('form', form)
      component.setInput('registry', createDefaultRegistry())
      component.setInput('messages', messages)
      component.setInput('idPrefix', `angular-${app}`)
      component.setInput('summary', summary)
      host.append(component.location.nativeElement)
      application.attachView(component.hostView)
      application.tick()
      await application.whenStable()

      return {
        root: host,
        async act(run) {
          run()
          await application.whenStable()
          application.tick()
        },
        async setMessages(next: FormMessages) {
          component.setInput('messages', next)
          await application.whenStable()
          application.tick()
        },
        unmount() {
          application.detachView(component.hostView)
          component.destroy()
          component.location.nativeElement.remove()
        },
      }
    },
  }
}

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { Input } from '@angular/core'

@Component({
  selector: 'texaryn-angular-test-host',
  standalone: true,
  imports: [FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <texaryn-form-root
      [form]="form"
      [registry]="registry"
      [messages]="messages"
      [idPrefix]="idPrefix"
      [showErrorSummary]="summaryEnabled"
      [summaryFocus]="summaryFocus"
    />
  `,
})
class AngularTestHost {
  @Input({ required: true }) form!: AngularForm
  @Input({ required: true }) registry!: RendererRegistry<WidgetComponent>
  @Input() messages: FormMessages | undefined
  @Input({ required: true }) idPrefix!: string
  @Input() summary: boolean | { focus: boolean } | undefined

  get summaryEnabled(): boolean { return Boolean(this.summary) }
  get summaryFocus(): boolean { return typeof this.summary === 'object' ? this.summary.focus : true }
}
