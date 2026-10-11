import { NgComponentOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import type { Type } from '@angular/core'
import type { UINode } from '@texaryn/core'
import { useFormContext } from '../context.js'
import type { AngularWidget } from '../widget.js'

@Component({
  selector: 'texaryn-node-renderer',
  standalone: true,
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (node().visible) {
      @if (component(); as selected) {
        <ng-container *ngComponentOutlet="selected; inputs: componentInputs()" />
      }
    }
  `,
})
export class NodeRenderer {
  readonly node = input.required<UINode>()
  private readonly context = useFormContext()
  readonly component = computed<Type<AngularWidget> | undefined>(() =>
    this.context.registry().resolve(this.node()),
  )
  readonly componentInputs = computed(() => ({ node: this.node() }))
}
