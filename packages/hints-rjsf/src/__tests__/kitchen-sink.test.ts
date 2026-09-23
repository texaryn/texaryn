import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { FieldNode, JsonPointer } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { fromUiSchema, splitBackstageStep } from '../index.js'
import type { UiSchemaConversion } from '../index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const steps = JSON.parse(readFileSync(join(__dirname, './fixtures/kitchen-sink.json'), 'utf8')) as unknown[]

async function convertStep(index: number) {
  const split = splitBackstageStep(steps[index])
  const port = await createJsonSchemaAdapter(split.schema)
  return { port, conversion: fromUiSchema(split.uiSchema, port.project({})) }
}

function summary(conversion: UiSchemaConversion) {
  return {
    hints: conversion.hints,
    components: conversion.components.map((requirement) => [requirement.name, requirement.key, requirement.pointer, requirement.rows]),
    issues: conversion.issues.map((issue) => [issue.code, issue.key, issue.path]),
  }
}

describe('the spike kitchen sink', () => {
  it('converts the basic widgets step, and the runtime applies the hint', async () => {
    const { port, conversion } = await convertStep(0)
    expect(summary(conversion)).toEqual({
      hints: { '/description': { widget: 'textarea' } },
      components: [
        ['password', 'ui:widget', '/password', false],
        ['color', 'ui:widget', '/favouriteColour', false],
      ],
      issues: [
        ['unsupported', 'ui:autofocus', '/name/ui:autofocus'],
        ['unsupported', 'ui:rows', '/description/ui:options/rows'],
        ['unsupported', 'ui:widget', '/secret/ui:widget'],
      ],
    })
    const runtime = createFormRuntime(port, { initialData: {}, hints: conversion.hints })
    const nodes = Object.values(runtime.document.getSnapshot().nodes)
    expect((nodes.find((node) => node.dataPointer === '/description') as FieldNode).widget).toBe('textarea')
    expect((nodes.find((node) => node.dataPointer === '/password') as FieldNode).widget).toBeUndefined()
  })

  it('converts the numbers step', async () => {
    expect(summary((await convertStep(1)).conversion)).toEqual({
      hints: {},
      components: [
        ['range', 'ui:widget', '/confidence', false],
        ['radio', 'ui:widget', '/consent', false],
      ],
      issues: [],
    })
  })

  it('converts the selects step', async () => {
    expect(summary((await convertStep(2)).conversion)).toEqual({
      hints: { '/tags': { canReorder: true } },
      components: [
        ['radio', 'ui:widget', '/region', false],
        ['checkboxes', 'ui:widget', '/features', false],
      ],
      issues: [],
    })
  })

  it('converts the dates step to nothing', async () => {
    expect(summary((await convertStep(3)).conversion)).toEqual({ hints: {}, components: [], issues: [] })
  })

  it('converts the nested step', async () => {
    expect(summary((await convertStep(4)).conversion)).toEqual({ hints: { '/contacts': { canReorder: true } }, components: [], issues: [] })
  })

  it('accepts the lastName that only the dependencies branch declares', async () => {
    const { conversion } = await convertStep(5)
    expect(summary(conversion)).toEqual({ hints: {}, components: [], issues: [] })
    expect(conversion.uiSchemaAt('/lastName' as JsonPointer)).toEqual({ options: {}, uiSchema: {} })
  })

  it('lists the eleven pickers as components and hands each its options', async () => {
    const { conversion } = await convertStep(6)
    expect(conversion.components.map((requirement) => [requirement.name, requirement.pointer])).toEqual([
      ['EntityNamePicker', '/componentName'],
      ['OwnerPicker', '/ownerRef'],
      ['EntityPicker', '/relatedEntity'],
      ['MultiEntityPicker', '/relatedEntities'],
      ['MyGroupsPicker', '/myGroups'],
      ['OwnedEntityPicker', '/ownedEntity'],
      ['EntityTagsPicker', '/entityTags'],
      ['RepoUrlPicker', '/repoUrl'],
      ['RepoOwnerPicker', '/repoOwner'],
      ['RepoBranchPicker', '/repoBranch'],
      ['Secret', '/deployToken'],
    ])
    expect(conversion.components.every((requirement) => requirement.key === 'ui:field' && !requirement.rows)).toBe(true)
    expect(conversion.issues).toEqual([])
    expect(conversion.hints).toEqual({})
    expect(conversion.uiSchemaAt('/repoUrl' as JsonPointer)?.options.allowedHosts).toEqual(['github.com', 'gitlab.com'])
    expect(conversion.uiSchemaAt('/ownerRef' as JsonPointer)?.options.catalogFilter).toEqual({ kind: ['User', 'Group'] })
  })
})
