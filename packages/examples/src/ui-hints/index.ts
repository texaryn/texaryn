import { pointer } from '../types.js'
import type { TexarynExample } from '../types.js'

export const widgetSelection: TexarynExample = {
  id: 'ui-hint-widget',
  title: 'Widget selection',
  description:
    'A string field asked to render as a textarea. The hint travels on the node, so each renderer picks its own component for it rather than Texaryn naming a DOM element.',
  category: 'ui-hints',
  covers: ['ui-hint.widget', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Article',
    properties: {
      body: { type: 'string', title: 'Body' },
    },
  },
  hints: {
    '/body': { widget: 'textarea' },
  },
  initialData: { body: 'A longer piece of text.' },
}

export const placeholderAndHelpText: TexarynExample = {
  id: 'ui-hint-placeholder-help',
  title: 'Placeholder and help text',
  description:
    'Presentation hints that carry no schema meaning. Help text sits alongside the description annotation, and a renderer decides how the two combine.',
  category: 'ui-hints',
  covers: ['ui-hint.placeholder', 'ui-hint.helpText', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Profile',
    properties: {
      handle: { type: 'string', title: 'Handle' },
      website: { type: 'string', title: 'Website' },
    },
  },
  hints: {
    '/handle': { placeholder: 'ada' },
    '/website': { placeholder: 'https://example.com', helpText: 'Include the scheme.' },
  },
  initialData: { handle: '', website: '' },
}

export const siblingOrder: TexarynExample = {
  id: 'ui-hint-order',
  title: 'Sibling order',
  description:
    'Presentation order set independently of the schema. A field without a hint keeps its schema position, so the two share one scale: moving a field to the front means giving it a value below every schema index.',
  category: 'ui-hints',
  covers: ['ui-hint.order', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Ordered',
    properties: {
      street: { type: 'string', title: 'Street' },
      city: { type: 'string', title: 'City' },
      country: { type: 'string', title: 'Country' },
    },
  },
  hints: {
    '/country': { order: -1 },
  },
  initialData: { street: '', city: '', country: '' },
}

export const arrayHints: TexarynExample = {
  id: 'ui-hint-array',
  title: 'Array hints',
  description:
    'Reordering is opt in, and an item key names the property that identifies a row. With a key, identity follows the item through reordering rather than following its index.',
  category: 'ui-hints',
  covers: ['ui-hint.array.canReorder', 'ui-hint.array.itemKey', 'schema.array.of-objects'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Playlist',
    properties: {
      tracks: {
        type: 'array',
        title: 'Tracks',
        items: {
          type: 'object',
          title: 'Track',
          properties: {
            id: { type: 'string', title: 'ID' },
            name: { type: 'string', title: 'Name' },
          },
        },
      },
    },
  },
  hints: {
    '/tracks': { canReorder: true, itemKey: pointer('/id') },
  },
  initialData: {
    tracks: [
      { id: 'a', name: 'First' },
      { id: 'b', name: 'Second' },
    ],
  },
}

export const uiHintExamples = [
  widgetSelection,
  placeholderAndHelpText,
  siblingOrder,
  arrayHints,
] as const
