import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type { JsonPointer, SchemaEvaluationPort, SchemaProjection } from '@texaryn/core'
import { FormRoot, createDefaultRegistry, provideFormRuntime, useForm } from '../index.js'
import { settle } from './harness.js'

describe('object projection boundary actions', () => {
  it('dispatches the selected boundary token', async () => {
    const target = {
      pointer: '/child' as JsonPointer,
      reason: 'recursion' as const,
      token: 'recursive-child',
    }
    const projection: SchemaProjection = {
      nodes: new Map([
        ['' as JsonPointer, {
          type: 'object',
          constraints: {},
          active: true,
          annotations: { title: 'Tree' },
          children: [],
          boundaryTargets: [target],
        }],
      ]),
    }
    const port: SchemaEvaluationPort = {
      project: () => projection,
      validate: () => ({ valid: true, errors: [] }),
    }

    let dispatch: ReturnType<typeof vi.spyOn> | undefined
    const wrapper = mount(defineComponent({
      setup() {
        const form = useForm(port, { initialData: {}, validationDebounceMs: 0 })
        dispatch = vi.spyOn(form.runtime, 'dispatch')
        provideFormRuntime(form.runtime)
        return () => h(FormRoot, { registry: createDefaultRegistry() })
      },
    }))

    await settle()
    await wrapper.find('button[aria-label="Expand recursive fields in Tree"]').trigger('click')

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ExpandBoundary',
      containerId: expect.any(String),
      targetToken: target.token,
    })
    wrapper.unmount()
  })
})
