import { waitFor } from '@testing-library/react'

function labeledInput(root: ParentNode, name: string): HTMLInputElement | null {
  for (const label of root.querySelectorAll('label')) {
    if (label.textContent?.trim() === name && label.control instanceof HTMLInputElement) {
      return label.control
    }
  }

  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (element.shadowRoot) {
      const input = labeledInput(element.shadowRoot, name)
      if (input) return input
    }
  }

  return null
}

export function findRendererInput(region: HTMLElement, name: string): Promise<HTMLInputElement> {
  return waitFor(() => {
    const input = labeledInput(region, name)
    if (!input) throw new Error(`No ${name} input is rendered in the selected surface: ${region.textContent?.trim()}`)
    return input
  }, { timeout: 5000 })
}
