import { createBootstrapRegistry } from '@texaryn/react-bootstrap'
import { exampleRendererMatrix } from './example-renderer-matrix.js'

exampleRendererMatrix({ name: 'bootstrap', createRegistry: createBootstrapRegistry })
