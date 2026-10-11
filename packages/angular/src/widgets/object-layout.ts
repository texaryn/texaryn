import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { englishMessages, objectChildKey } from '@texaryn/core'
import type { ContainerNode, UINode } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { NodeRenderer } from '../components/node-renderer.js'

@Component({
  selector: 'texaryn-object-layout',
  standalone: true,
  imports: [NgTemplateOutlet, NodeRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = currentNode();
    @if (current.parentId === null) {
      <div>
        <ng-container *ngTemplateOutlet="content" />
      </div>
    } @else {
      <fieldset [attr.role]="current.annotations.title === undefined ? 'none' : null">
        @if (current.annotations.title !== undefined) {
          <legend>{{ current.annotations.title }}</legend>
        }
        <div>
          <ng-container *ngTemplateOutlet="content" />
        </div>
      </fieldset>
    }
    <ng-template #content>
      @for (child of children(); track childKey(child)) {
        <texaryn-node-renderer [node]="child" />
      }
      @for (action of expandActions(); track action.target.reason) {
        <button
          type="button"
          [attr.aria-label]="action.message.accessibleName"
          (click)="expand(action.target.token)"
        >{{ action.message.label }}</button>
      }
    </ng-template>
  `,
})
export class ObjectLayout {
  readonly node = input.required<UINode>()
  private readonly context = useFormContext()
  readonly currentNode = computed(() => {
    const node = this.node() as ContainerNode
    return (this.context.form().document().nodes[node.id] ?? node) as ContainerNode
  })
  readonly children = computed(() => {
    const document = this.context.form().document()
    return this.currentNode().children
      .map((id) => document.nodes[id])
      .filter((child): child is UINode => child !== undefined)
  })
  readonly expandActions = computed(() => {
    const current = this.currentNode()
    const messages = this.context.messages() ?? englishMessages
    const firstByReason = new Map<string, NonNullable<ContainerNode['boundaryTargets']>[number]>()
    for (const target of current.boundaryTargets ?? []) {
      if (!firstByReason.has(target.reason)) firstByReason.set(target.reason, target)
    }
    return [...firstByReason.values()].map((target) => ({
      target,
      message: (messages.expandBoundary ?? englishMessages.expandBoundary!)({
        boundary: target.reason,
        containerTitle: current.annotations.title,
        position: 1,
        count: 1,
      }),
    }))
  })
  readonly childKey = objectChildKey

  expand(targetToken: string): void {
    this.context.form().dispatch({
      type: 'ExpandBoundary',
      containerId: this.currentNode().id,
      targetToken,
    })
  }
}
