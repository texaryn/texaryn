export const arrayItemDragType = 'application/x-texaryn-array-item'

export function createArrayDragTransfer(): DataTransfer {
  const values = new Map<string, string>()
  const types: string[] = []
  return {
    get types() { return types },
    effectAllowed: 'none',
    dropEffect: 'none',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    getData: (type: string) => values.get(type) ?? '',
    setData(type: string, value: string) {
      values.set(type, value)
      if (!types.includes(type)) types.push(type)
    },
    clearData(type?: string) {
      if (type === undefined) values.clear()
      else values.delete(type)
      types.splice(0, types.length, ...values.keys())
    },
    setDragImage: () => {},
  } as DataTransfer
}

export function dispatchArrayDrag(
  type: string,
  target: Element,
  dataTransfer: DataTransfer,
  clientY = 0,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientY: { value: clientY },
  })
  target.dispatchEvent(event)
  return event
}
