import { describe, it, expect } from 'vitest'
import { auditThemeContract } from './check-theme-contract.mjs'
import { themeBootScript } from '../theme.config.mjs'

const BOOT = themeBootScript()

function site(pages) {
  const files = Object.keys(pages)
  return { files, read: (file) => pages[file] }
}

describe('auditThemeContract', () => {
  it('passes a site where every document carries the generated script', () => {
    const { files, read } = site({
      'index.html': `<head>${BOOT}</head>`,
      'playground/index.html': `<head>${BOOT}</head>`,
    })
    expect(auditThemeContract(files, read)).toMatchObject({ missing: [], foreign: [], checked: 2 })
  })

  it('reports a document with no boot script', () => {
    const { files, read } = site({
      'index.html': `<head>${BOOT}</head>`,
      'playground/index.html': '<head></head>',
    })
    expect(auditThemeContract(files, read).missing).toEqual(['playground/index.html'])
  })

  // The failure this exists for: two builds that resolve the preference
  // differently look identical until one of them is read.
  it('reports a boot script that is not the one this repository generates', () => {
    const drifted = BOOT.replace('"texaryn-theme"', '"something-else"')
    const { files, read } = site({ 'index.html': `<head>${drifted}</head>` })
    expect(auditThemeContract(files, read).missing).toEqual(['index.html'])
  })

  it("reports Starlight's own preference key", () => {
    const { files, read } = site({
      'index.html': `<head>${BOOT}<script>localStorage.getItem('starlight-theme')</script></head>`,
    })
    expect(auditThemeContract(files, read).foreign).toEqual(['index.html'])
  })

  // The picker is still Starlight's custom element, so the key appears as a
  // substring of a name on every page. Matching that would fail the whole site.
  it('does not mistake the starlight-theme-select element for the key', () => {
    const { files, read } = site({
      'index.html': `<head>${BOOT}</head><body><starlight-theme-select></starlight-theme-select></body>`,
    })
    expect(auditThemeContract(files, read).foreign).toEqual([])
  })
})
