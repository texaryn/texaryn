import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'core',
      root: 'packages/core',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'react',
      root: 'packages/react',
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
    },
  },
  {
    test: {
      name: 'binding-spikes',
      root: 'tests',
      include: ['binding-spikes/**/*.test.ts'],
    },
  },
])
