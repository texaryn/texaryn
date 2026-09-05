import { createMuiRegistry } from '@texaryn/react-mui'
import { exampleRendererMatrix } from './react-renderer-matrix.js'

exampleRendererMatrix({ name: 'mui', createRegistry: createMuiRegistry })
