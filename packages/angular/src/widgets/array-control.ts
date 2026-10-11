import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core'
import type { ContainerNode, FormRuntime, StableItemId, UINode } from '@texaryn/core'
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
    <div data-array-container="array">
    @for (item of array.items(); track item.id; let index = $index) {
      <div
        data-array-row
        [attr.data-array-item-id]="item.id"
        (dragover)="dragOver($event, item.id)"
        (dragleave)="dragLeave($event)"
        (drop)="drop($event, item.id)"
      >
        @if (canDrag()) {
          <span
            aria-hidden="true"
            class="texaryn-array-drag-handle"
            tabindex="-1"
            draggable="true"
            (dragstart)="startDrag($event, item.id)"
            (dragend)="endDrag($event)"
          >⠿</span>
        }
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
    </div>
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
  readonly canDrag = computed(() =>
    this.currentArray().arrayMeta?.canReorder === true &&
    !this.currentArray().readOnly && !this.currentArray().disabled,
  )
  private readonly dragSession = signal<{
    runtime: FormRuntime
    identityKey: NonNullable<ContainerNode['arrayMeta']>['identityKey']
    root: HTMLDivElement
    itemId: StableItemId
  } | null>(null)
  private readonly dragCleanup = effect(() => {
    const session = this.dragSession()
    if (!session) return
    const runtime = this.context.form().runtime
    const array = this.currentArray()
    if (
      session.runtime !== runtime || session.identityKey !== array.arrayMeta?.identityKey ||
      !this.canDrag() || !array.arrayMeta?.itemIds.includes(session.itemId)
    ) untracked(() => this.clearDrag())
  })
  private readonly injector = inject(Injector)

  private readonly dragType = 'application/x-texaryn-array-item'

  private ownsTarget(event: DragEvent, root: HTMLDivElement): boolean {
    return event.target instanceof Element && event.target.closest('[data-array-container]') === root
  }

  private clearDrag(): void {
    const root = this.dragSession()?.root
    root?.removeAttribute('data-array-drag-active')
    root?.querySelectorAll<HTMLElement>('[data-dragging], [data-drop-target]').forEach((row) => {
      row.removeAttribute('data-dragging')
      row.removeAttribute('data-drop-target')
    })
    this.dragSession.set(null)
  }

  startDrag(event: DragEvent, itemId: StableItemId): void {
    const current = this.currentArray()
    const root = (event.currentTarget as HTMLElement).closest<HTMLDivElement>('[data-array-container]')
    const identityKey = current.arrayMeta?.identityKey
    if (!this.canDrag() || !root || identityKey === undefined || !current.arrayMeta?.itemIds.includes(itemId) || !event.dataTransfer) {
      event.preventDefault()
      return
    }
    event.stopPropagation()
    event.dataTransfer.setData(this.dragType, itemId)
    event.dataTransfer.effectAllowed = 'move'
    this.dragSession.set({ runtime: this.context.form().runtime, identityKey, root, itemId })
    root.setAttribute('data-array-drag-active', '')
    ;(event.currentTarget as HTMLElement).closest('[data-array-row]')?.setAttribute('data-dragging', '')
  }

  endDrag(event: DragEvent): void {
    event.dataTransfer?.clearData(this.dragType)
    this.clearDrag()
  }

  dragOver(event: DragEvent, itemId: StableItemId): void {
    if (!Array.from(event.dataTransfer?.types ?? []).includes(this.dragType)) return
    const currentTarget = event.currentTarget as HTMLElement
    const root = currentTarget.closest<HTMLDivElement>('[data-array-container]')
    if (!root || !this.ownsTarget(event, root)) {
      event.stopPropagation()
      return
    }
    const session = this.dragSession()
    const current = this.currentArray()
    const ids = current.arrayMeta?.itemIds ?? []
    if (
      !session || session.runtime !== this.context.form().runtime || session.root !== root ||
      session.identityKey !== current.arrayMeta?.identityKey || !this.canDrag() ||
      !ids.includes(session.itemId) || !ids.includes(itemId)
    ) {
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    currentTarget.setAttribute('data-drop-target', '')
  }

  dragLeave(event: DragEvent): void {
    if (Array.from(event.dataTransfer?.types ?? []).includes(this.dragType)) {
      (event.currentTarget as HTMLElement).removeAttribute('data-drop-target')
    }
  }

  drop(event: DragEvent, itemId: StableItemId): void {
    if (!Array.from(event.dataTransfer?.types ?? []).includes(this.dragType)) return
    event.stopPropagation()
    const currentTarget = event.currentTarget as HTMLElement
    const root = currentTarget.closest<HTMLDivElement>('[data-array-container]')
    const session = this.dragSession()
    const current = this.currentArray()
    const ids = current.arrayMeta?.itemIds ?? []
    if (!root || !this.ownsTarget(event, root) || !session) {
      this.clearDrag()
      return
    }
    const sourceIndex = ids.indexOf(session.itemId)
    const targetIndex = ids.indexOf(itemId)
    if (
      session.runtime !== this.context.form().runtime || session.root !== root ||
      session.identityKey !== current.arrayMeta?.identityKey || !this.canDrag() ||
      sourceIndex < 0 || targetIndex < 0
    ) {
      this.clearDrag()
      return
    }
    event.preventDefault()
    const bounds = currentTarget.getBoundingClientRect()
    const after = event.clientY >= bounds.top + bounds.height / 2
    const boundary = targetIndex + (after ? 1 : 0)
    const destination = boundary > sourceIndex ? boundary - 1 : boundary
    this.clearDrag()
    if (destination !== sourceIndex) this.array.move(sourceIndex, destination)
  }

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
