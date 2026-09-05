import { createBootstrapRegistry } from '@texaryn/react-bootstrap'
import { exampleRendererMatrix } from './react-renderer-matrix.js'

exampleRendererMatrix({ name: 'bootstrap', createRegistry: createBootstrapRegistry })
