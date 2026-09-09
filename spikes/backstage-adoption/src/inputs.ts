/**
 * The fixed input set. Three states per step: nothing filled in, an invalid
 * fill, and a complete valid fill.
 *
 * Fixed rather than generated, because the comparison is only meaningful if
 * both sides see byte-identical data, and because a divergence has to be
 * reproducible to be worth reporting.
 *
 * Keyed by step title, which is what the resolved template gives.
 */
export interface StepInputs {
  empty: unknown
  invalid: unknown
  valid: unknown
}

export const inputsByStep: Record<string, StepInputs> = {
  'Basic widgets': {
    empty: {},
    // `name` and `email` are the step's required fields; the email is also
    // malformed, so `format` has something to say if a dialect asserts it.
    invalid: { description: 'no name, no email', website: 'not a url' },
    valid: {
      name: 'checkout',
      description: 'The checkout service',
      email: 'team@example.com',
      website: 'https://example.com',
      password: 'hunter2',
      favouriteColour: '#00ff00',
      secret: 'from-the-form',
    },
  },

  'Numbers, ranges and toggles': {
    empty: {},
    // `replicas` has minimum 1 and maximum 10; `confidence` 0 to 100.
    invalid: { replicas: 0, confidence: 250, enabled: 'yes', consent: true },
    valid: { replicas: 3, confidence: 50, enabled: true, consent: true },
  },

  'Selects and groups': {
    empty: {},
    // `environment` and `region` are enums; `features` is a uniqueItems array
    // of enums, so a duplicate and an unknown member are both violations.
    invalid: {
      environment: 'staging-ish',
      region: 'eu-west-9',
      features: ['logging', 'logging'],
      tags: ['a'],
    },
    valid: {
      environment: 'production',
      region: 'eu-west-1',
      features: ['logging', 'metrics'],
      tags: ['payments', 'tier-1'],
    },
  },

  'Dates and files': {
    empty: {},
    // `data-url` is RJSF's own format rather than a standard one, so the
    // `readme` value is where the two validators may legitimately disagree.
    invalid: {
      startDate: 'yesterday',
      startDateTime: 'noon',
      cutoffTime: '25:00:00',
      readme: 'not-a-data-url',
    },
    valid: {
      startDate: '2026-09-09',
      startDateTime: '2026-09-09T12:00:00Z',
      // With an offset, because RFC 3339 `full-time` requires one. Without it
      // this fill is invalid, which is a real difference between the two
      // validators rather than a property of the form: see `formats.test.ts`.
      cutoffTime: '17:30:00Z',
      readme: 'data:text/plain;name=readme.md;base64,aGVsbG8=',
    },
  },

  'Nested objects and arrays': {
    empty: {},
    // `owner.displayName` is required by the nested object, and every contact
    // requires `name`, so this is invalid two levels down.
    invalid: {
      owner: { slack: '@team' },
      contacts: [{ role: 'PM' }, { name: 'Ada', role: 'Astronaut' }],
    },
    valid: {
      owner: { displayName: 'Platform', slack: '@platform' },
      contacts: [
        { name: 'Ada', role: 'Engineer', primary: true },
        { name: 'Grace', role: 'PM', primary: false },
      ],
    },
  },

  'Fill in some steps': {
    empty: {},
    // The conditional: `includeName` true reveals a required `lastName`.
    invalid: { includeName: true },
    valid: { includeName: true, lastName: 'Lovelace' },
  },

  'Catalog and repo pickers': {
    empty: {},
    // Nothing in this step is required and every property is a plain string,
    // so it has no invalid state through the schema alone. The custom field
    // extension is what makes one, and it is tested separately.
    invalid: { relatedEntities: 'not-an-array' },
    valid: {
      componentName: 'checkout',
      ownerRef: 'group:default/platform',
      relatedEntity: 'component:default/payments',
      relatedEntities: ['component:default/payments'],
      myGroups: 'group:default/platform',
      ownedEntity: 'component:default/checkout',
      entityTags: ['tier-1'],
      repoUrl: 'github.com?owner=texaryn&repo=checkout',
      repoOwner: 'texaryn',
      repoBranch: 'main',
      deployToken: 'should-not-reach-parameters',
    },
  },
}
