let instanceCounter = 0

/** One prefix per `<texaryn-form>` instance, so two forms on a page never share an id. */
export function nextInstancePrefix(): string {
  instanceCounter += 1
  return `texaryn-${instanceCounter}`
}

export function makeId(prefix: string, nodeId: string, suffix: string): string {
  return `${prefix}-${nodeId}-${suffix}`
}
