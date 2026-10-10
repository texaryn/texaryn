import { englishMessages } from '@texaryn/core'
import type { ContainerNode } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useFormMessages } from '../messages.js'

export interface ProjectionBoundaryActionsProps {
  container: ContainerNode
  title?: string
}

export function ProjectionBoundaryActions({
  container,
  title,
}: ProjectionBoundaryActionsProps) {
  const runtime = useFormContext()
  const messages = useFormMessages()
  const targets = container.boundaryTargets ?? []
  const firstTargetByReason = new Map<string, (typeof targets)[number]>()
  for (const target of targets) {
    if (!firstTargetByReason.has(target.reason)) firstTargetByReason.set(target.reason, target)
  }

  return [...firstTargetByReason.values()].map((target) => {
    const message = (messages.expandBoundary ?? englishMessages.expandBoundary)({
      boundary: target.reason,
      containerTitle: title,
      position: 1,
      count: 1,
    })
    return (
      <button
        key={target.reason}
        type="button"
        aria-label={message.accessibleName}
        onClick={() =>
          runtime.dispatch({
            type: 'ExpandBoundary',
            containerId: container.id,
            targetToken: target.token,
          })
        }
      >
        {message.label}
      </button>
    )
  })
}
