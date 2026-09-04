import { createMuiRegistry } from '@texaryn/react-mui'
import { exampleRendererMatrix } from './example-renderer-matrix.js'

exampleRendererMatrix({ name: 'mui', createRegistry: createMuiRegistry })
