import { createDefaultRegistry } from '@texaryn/vue'
import { vueExampleRendererMatrix } from './vue-renderer-matrix.js'

vueExampleRendererMatrix({ name: 'vue', createRegistry: createDefaultRegistry }) // NOSONAR The shared harness registers this file's tests.
