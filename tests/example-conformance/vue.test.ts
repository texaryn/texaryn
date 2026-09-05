import { createDefaultRegistry } from '@texaryn/vue'
import { vueExampleRendererMatrix } from './vue-renderer-matrix.js'

vueExampleRendererMatrix({ name: 'vue', createRegistry: createDefaultRegistry })
