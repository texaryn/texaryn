import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
} from '@angular/core'
import type { ContainerNode, UINode } from '@texaryn/core'
import { englishMessages } from '@texaryn/core'
import { NodeRenderer } from '../components/node-renderer.js'
import { useFormContext } from '../context.js'
import { useFieldArray } from '../use-field-array.js'

@Component({
  selector: 'texaryn-array-control',
  standalone: true,
  imports: [NodeRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of array.items(); track item.id; let index = $index) {
      <div data-array-row>
        @if (item.nodeId; as childId) {
          @let child = context.form().document().nodes[childId];
          @if (child) {
            <texaryn-node-renderer [node]="child" />
          }
        }
        @if (array.canReorder() && index > 0) {
          @let action = messages().moveItemUp({
            position: index + 1,
            itemTitle: itemTitle(item.nodeId),
            containerTitle: currentArray().annotations.title,
          });
          <button
            type="button"
            data-reorder-direction="up"
            [attr.aria-label]="action.accessibleName"
            (click)="move($event, index, index - 1, 'down', index === 1)"
          >{{ action.label }}</button>
        }
        @if (array.canReorder() && index < array.items().length - 1) {
          @let action = messages().moveItemDown({
            position: index + 1,
            itemTitle: itemTitle(item.nodeId),
            containerTitle: currentArray().annotations.title,
          });
          <button
            type="button"
            data-reorder-direction="down"
            [attr.aria-label]="action.accessibleName"
            (click)="move($event, index, index + 1, 'up', index === array.items().length - 2)"
          >{{ action.label }}</button>
        }
        @if (array.canRemove()) {
          @let action = messages().removeItem({
            position: index + 1,
            itemTitle: itemTitle(item.nodeId),
            containerTitle: currentArray().annotations.title,
          });
          <button type="button" [attr.aria-label]="action.accessibleName" (click)="array.remove(index)">
            {{ action.label }}
          </button>
        }
      </div>
    }
    @if (array.canAdd()) {
      @let action = messages().addItem({
        itemTemplateTitle: currentArray().arrayMeta?.itemTitle,
        containerTitle: currentArray().annotations.title,
      });
      <button type="button" [attr.aria-label]="action.accessibleName" (click)="array.add()">
        {{ action.label }}
      </button>
    }
  `,
})
export class ArrayControl {
  readonly node = input.required<UINode>()
  readonly context = useFormContext()
  readonly array = useFieldArray(() => this.node().id)
  readonly currentArray = computed(() => {
    const node = this.node() as ContainerNode
    return (this.context.form().document().nodes[node.id] ?? node) as ContainerNode
  })
  readonly messages = computed(() => this.context.messages() ?? englishMessages)
  private readonly injector = inject(Injector)

  itemTitle(nodeId: string | undefined): string | undefined {
    if (!nodeId) return undefined
    return this.context.form().document().nodes[nodeId]?.annotations.title
  }

  move(
    event: MouseEvent,
    from: number,
    to: number,
    nextDirection: 'up' | 'down',
    restoreAtBoundary: boolean,
  ): void {
    const button = event.currentTarget as HTMLButtonElement
    const wasFocused = button.ownerDocument.activeElement === button
    const row = button.closest<HTMLElement>('[data-array-row]')
    this.array.move(from, to)
    if (wasFocused && restoreAtBoundary) {
      afterNextRender({
        mixedReadWrite: () =>
          row?.querySelector<HTMLButtonElement>(`[data-reorder-direction="${nextDirection}"]`)?.focus(),
      }, { injector: this.injector })
    }
  }
}
