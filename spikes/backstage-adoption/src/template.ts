import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const templatePath = resolve(here, '../template/template.yaml')
export const fragmentPath = resolve(here, '../template/parameters-pickers.yaml')

/** The URL the committed template declares for its `$yaml` fragment. */
export const fragmentUrl =
  'https://github.com/texaryn/texaryn/blob/main/spikes/backstage-adoption/template/parameters-pickers.yaml'

export const templateYaml = readFileSync(templatePath, 'utf8')
