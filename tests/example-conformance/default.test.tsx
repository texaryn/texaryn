import { createDefaultRegistry } from '@texaryn/react'
import { exampleRendererMatrix } from './react-renderer-matrix.js'

exampleRendererMatrix({ name: 'default', createRegistry: createDefaultRegistry }) // NOSONAR The shared harness registers this file's tests.
