import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  Injector,
  viewChild,
} from '@angular/core'
import type { FormMessages } from '@texaryn/core'
import { createFailedSubmitTracker, englishMessages, visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { AngularForm } from '../form.js'
import { makeId } from '../field-props.js'

@Component({
  selector: 'texaryn-error-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (form().visibleErrors().length > 0) {
      <div
        #container
        role="group"
        tabindex="-1"
        [attr.aria-labelledby]="headingId()"
      >
        <h2 [id]="headingId()">{{ messageSet().errorSummaryHeading({ count: form().visibleErrors().length }) }}</h2>
        <ul>
          @for (entry of form().visibleErrors(); track entry.nodeId) {
            <li><a [attr.href]="'#' + makeId(idPrefix(), entry.nodeId, 'input')">{{ errorLabel(entry) }}</a>{{ messageSet().errorSummaryDetail({ messages: errorMessages(entry) }) }}</li>
          }
        </ul>
      </div>
    }
  `,
})
export class ErrorSummary {
  readonly form = input.required<AngularForm>()
  readonly idPrefix = input.required<string>()
  readonly messages = input<FormMessages | undefined>(undefined)
  readonly focus = input(true)
  readonly messageSet = computed(() => this.messages() ?? englishMessages)
  readonly headingId = computed(() => makeId(this.idPrefix(), 'error-summary', 'heading'))
  readonly errorLabel = visibleErrorLabel
  readonly errorMessages = visibleErrorMessages
  readonly makeId = makeId
  private readonly injector = inject(Injector)
  private readonly container = viewChild<ElementRef<HTMLDivElement>>('container')

  constructor() {
    let tracker: ReturnType<typeof createFailedSubmitTracker> | undefined
    effect(() => {
      const form = this.form()
      const submission = form.submission()
      const errors = form.visibleErrors()
      if (!tracker) {
        tracker = createFailedSubmitTracker(submission)
        return
      }
      if (!tracker.settle(submission, errors) || !this.focus()) return
      afterNextRender({
        write: () => this.container()?.nativeElement.focus(),
      }, { injector: this.injector })
    })
  }
}
