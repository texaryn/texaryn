import { createDefaultRegistry } from '@texaryn/react'
import { exampleRendererMatrix } from './react-renderer-matrix.js'

exampleRendererMatrix({ name: 'default', createRegistry: createDefaultRegistry })
