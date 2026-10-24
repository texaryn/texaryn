import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { englishMessages, objectChildKey } from '@texaryn/core'
import type { ContainerNode, StableItemId, UINode } from '@texaryn/core'
import { useFormMessages, useFormRuntime } from '../context.js'
import { useStore } from '../use-store.js'
import { useFieldArray } from '../use-field-array.js'
import { NodeRenderer } from '../components/NodeRenderer.js'

const nodeProp = { node: { type: Object as PropType<UINode>, required: true } } as const

export const ObjectLayout = defineComponent({
  name: 'ObjectLayout',
  props: nodeProp,
  setup(props) {
    const runtime = useFormRuntime()
    const messages = useFormMessages()
    const document = useStore(runtime.document, runtime.document.getSnapshot())
    // Whether a node is nested is fixed for its lifetime, but its title is
    // not: a conditional subschema can add or drop one on any recompile.
    // Choosing the element once and re-deriving only the grouping semantics
    // keeps the subtree mounted, because swapping div for fieldset would
    // remount it and drop focus.
    const nested = props.node.parentId !== null
    const current = computed(
      () => (document.value.nodes[props.node.id] ?? props.node) as ContainerNode,
    )
    const title = computed(() => current.value.annotations.title)
    const boundaryTargets = computed(() => current.value.boundaryTargets ?? [])
    const children = computed(() =>
      current.value.children
        .map((id) => document.value.nodes[id])
        .filter((child): child is UINode => child != null),
    )

    return () => {
      const rendered = children.value.map((child) =>
        h(NodeRenderer, { key: objectChildKey(child), node: child }),
      )
      const firstTargetByReason = new Map<string, (typeof boundaryTargets.value)[number]>()
      for (const target of boundaryTargets.value) {
        if (!firstTargetByReason.has(target.reason)) firstTargetByReason.set(target.reason, target)
      }
      const expandActions = [...firstTargetByReason.values()].map((target) => {
        const message = (messages.value.expandBoundary ?? englishMessages.expandBoundary)({
          boundary: target.reason,
          containerTitle: title.value,
          position: 1,
          count: 1,
        })
        return h(
          'button',
          {
            key: target.reason,
            type: 'button',
            'aria-label': message.accessibleName,
            onClick: () =>
              runtime.dispatch({
                type: 'ExpandBoundary',
                containerId: current.value.id,
                targetToken: target.token,
              }),
          },
          message.label,
        )
      })
      if (!nested) return h('div', [...rendered, ...expandActions])
      // The root object is the form itself, so only a nested titled object
      // names a group. An unnamed group is noise, so the fieldset stops being
      // one. Children sit in their own element so the legend is never a
      // candidate for reorder.
      return h(
        'fieldset',
        { role: title.value === undefined ? 'none' : undefined },
        [
          ...(title.value === undefined ? [] : [h('legend', title.value)]),
          h('div', [...rendered, ...expandActions]),
        ],
      )
    }
  },
})

export const ArrayControl = defineComponent({
  name: 'ArrayControl',
  props: nodeProp,
  setup(props) {
    const runtime = useFormRuntime()
    const document = useStore(runtime.document, runtime.document.getSnapshot())
    const array = useFieldArray(() => props.node.id)
    const messages = useFormMessages()
    // Read from the document so a title added by a recompile reaches the name.
    const currentArray = computed(
      () => (document.value.nodes[props.node.id] ?? props.node) as ContainerNode,
    )
    const arrayTitle = computed(() => currentArray.value.annotations.title)
    const itemTemplateTitle = computed(() => currentArray.value.arrayMeta?.itemTitle)
    const rootRef = ref<HTMLDivElement | null>(null)
    const canDrag = computed(() =>
      array.canReorder.value && !currentArray.value.readOnly && !currentArray.value.disabled,
    )
    const dragSession = shallowRef<{
      runtime: ReturnType<typeof useFormRuntime>
      identityKey: NonNullable<ContainerNode['arrayMeta']>['identityKey']
      root: HTMLDivElement
      itemId: StableItemId
    } | null>(null)

    function clearDrag(): void {
      const root = rootRef.value
      if (root) delete root.dataset.arrayDragActive
      root?.querySelectorAll<HTMLElement>('[data-dragging], [data-drop-target]').forEach((row) => {
        delete row.dataset.dragging
        delete row.dataset.dropTarget
      })
      dragSession.value = null
    }

    function ownsArrayTarget(event: DragEvent, root: HTMLDivElement): boolean {
      return event.target instanceof Element && event.target.closest('[data-array-container]') === root
    }

    watchEffect(() => {
      const session = dragSession.value
      if (!session) return
      if (
        session.runtime !== runtime || session.root !== rootRef.value ||
        session.identityKey !== currentArray.value.arrayMeta?.identityKey || !canDrag.value ||
        !array.items.value.some((item) => item.id === session.itemId)
      ) clearDrag()
    })
    onBeforeUnmount(clearDrag)

    function handleProps(itemId: StableItemId) {
      return {
        'aria-hidden': 'true',
        class: 'texaryn-array-drag-handle',
        draggable: canDrag.value,
        tabindex: -1,
        onDragstart(event: DragEvent) {
          const root = rootRef.value
          const identityKey = currentArray.value.arrayMeta?.identityKey
          if (!canDrag.value || !root || identityKey === undefined || !currentArray.value.arrayMeta?.itemIds.includes(itemId)) {
            event.preventDefault()
            return
          }
          event.stopPropagation()
          event.dataTransfer?.setData('application/x-texaryn-array-item', itemId)
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
          dragSession.value = { runtime, identityKey, root, itemId }
          root.dataset.arrayDragActive = ''
          const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-array-row]')
          if (row) row.dataset.dragging = ''
        },
        onDragend(event: DragEvent) {
          event.dataTransfer?.clearData('application/x-texaryn-array-item')
          clearDrag()
        },
      }
    }

    function rowProps(itemId: StableItemId) {
      return {
        'data-array-row': '',
        'data-array-item-id': itemId,
        onDragover(event: DragEvent) {
          if (!Array.from(event.dataTransfer?.types ?? []).includes('application/x-texaryn-array-item')) return
          const root = rootRef.value
          if (!root || !ownsArrayTarget(event, root)) {
            event.stopPropagation()
            return
          }
          const session = dragSession.value
          const ids = currentArray.value.arrayMeta?.itemIds ?? []
          if (
            !session || session.runtime !== runtime || session.root !== root ||
            session.identityKey !== currentArray.value.arrayMeta?.identityKey || !canDrag.value ||
            !ids.includes(session.itemId) || !ids.includes(itemId)
          ) {
            event.stopPropagation()
            return
          }
          event.preventDefault()
          event.stopPropagation()
          const currentTarget = event.currentTarget as HTMLElement
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          currentTarget.dataset.dropTarget = ''
        },
        onDragleave(event: DragEvent) {
          if (event.dataTransfer && Array.from(event.dataTransfer.types).includes('application/x-texaryn-array-item')) {
            delete (event.currentTarget as HTMLElement).dataset.dropTarget
          }
        },
        onDrop(event: DragEvent) {
          if (!Array.from(event.dataTransfer?.types ?? []).includes('application/x-texaryn-array-item')) return
          event.stopPropagation()
          const root = rootRef.value
          const session = dragSession.value
          const ids = currentArray.value.arrayMeta?.itemIds ?? []
          if (!root || !ownsArrayTarget(event, root) || !session) {
            clearDrag()
            return
          }
          const sourceIndex = ids.indexOf(session.itemId)
          const targetIndex = ids.indexOf(itemId)
          if (
            session.runtime !== runtime || session.root !== root ||
            session.identityKey !== currentArray.value.arrayMeta?.identityKey || !canDrag.value ||
            sourceIndex < 0 || targetIndex < 0
          ) {
            clearDrag()
            return
          }
          event.preventDefault()
          const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
          const after = event.clientY >= bounds.top + bounds.height / 2
          const boundary = targetIndex + (after ? 1 : 0)
          const destination = boundary > sourceIndex ? boundary - 1 : boundary
          clearDrag()
          if (destination !== sourceIndex) array.move(sourceIndex, destination)
        },
      }
    }

    function renderMoveButton(direction: 'up' | 'down', index: number, itemTitle?: string) {
      if (
        !array.canReorder.value ||
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index >= array.items.value.length - 1)
      ) return null
      const move = direction === 'up'
        ? messages.value.moveItemUp({ position: index + 1, itemTitle, containerTitle: arrayTitle.value })
        : messages.value.moveItemDown({ position: index + 1, itemTitle, containerTitle: arrayTitle.value })
      const adjacentDirection = direction === 'up' ? 'down' : 'up'

      return h(
        'button',
        {
          type: 'button',
          'aria-label': move.accessibleName,
          'data-reorder-direction': direction,
          onClick: (event: MouseEvent) => {
            const wasFocused = globalThis.document.activeElement === event.currentTarget
            const row = (event.currentTarget as HTMLButtonElement).closest<HTMLElement>('[data-array-row]')
            array.move(index, direction === 'up' ? index - 1 : index + 1)
            const reachedBoundary = direction === 'up'
              ? index === 1
              : index === array.items.value.length - 2
            if (wasFocused && reachedBoundary) {
              void nextTick(() => row?.querySelector<HTMLButtonElement>(`:scope > [data-reorder-direction="${adjacentDirection}"]`)?.focus())
            }
          },
        },
        move.label,
      )
    }

    function renderRemoveButton(index: number, itemTitle?: string) {
      if (!array.canRemove.value) return null
      // The visible word stays short; the distinguishing name goes in aria-label,
      // which contains it so speech input still works.
      const remove = messages.value.removeItem({
        position: index + 1,
        itemTitle,
        containerTitle: arrayTitle.value,
      })
      return h(
        'button',
        { type: 'button', 'aria-label': remove.accessibleName, onClick: () => array.remove(index) },
        remove.label,
      )
    }

    function renderAddButton() {
      if (!array.canAdd.value) return null
      // The item template's title, not the first row's: a row may
      // not exist yet, which is when naming this matters most.
      const add = messages.value.addItem({
        itemTemplateTitle: itemTemplateTitle.value,
        containerTitle: arrayTitle.value,
      })
      return h(
        'button',
        { type: 'button', 'aria-label': add.accessibleName, onClick: () => array.add() },
        add.label,
      )
    }

    return () =>
      h('div', { ref: rootRef, 'data-array-container': '' }, [
        ...array.items.value.map((item, index) => {
          const child = item.nodeId ? document.value.nodes[item.nodeId] : undefined
          const itemTitle = child?.annotations.title
          return h(
            'div',
            // The stable item id keeps the row component and DOM mounted when its node moves.
            {
              key: item.id,
              ...rowProps(item.id),
            },
            [
              canDrag.value ? h('span', handleProps(item.id), '⠿') : null,
              child ? h(NodeRenderer, { node: child }) : null,
              renderMoveButton('up', index, itemTitle),
              renderMoveButton('down', index, itemTitle),
              renderRemoveButton(index, itemTitle),
            ],
          )
        }),
        renderAddButton(),
      ])
  },
})
