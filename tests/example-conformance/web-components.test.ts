import { createDefaultRegistry } from '@texaryn/web-components'
import { webComponentsExampleRendererMatrix } from './web-components-renderer-matrix.js'

webComponentsExampleRendererMatrix({ name: 'web-components', createRegistry: createDefaultRegistry }) // NOSONAR The shared harness registers this file's tests.
