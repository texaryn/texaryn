// @vitest-environment node
import { describe, it, expect } from 'vitest'
import validator from '@rjsf/validator-ajv8'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

/**
 * Which `format` values each side asserts on draft-07.
 *
 * The kitchen sink uses six and the step comparison showed the two sides
 * disagreeing, so this pins the whole set rather than the one case that
 * surfaced. Every format here is one the template asks for.
 */
async function texarynRejects(format: string, value: string): Promise<boolean> {
  const port = await createJsonSchemaAdapter(
    { type: 'object', properties: { field: { type: 'string', format } } },
    { defaultDialect: 'draft-07' },
  )
  return !(await port.validate({ field: value })).valid
}

function rjsfRejects(format: string, value: string): boolean {
  const out = validator.validateFormData({ field: value }, {
    type: 'object',
    properties: { field: { type: 'string', format } },
  } as never)
  return out.errors.length > 0
}

describe('format assertion on draft-07', () => {
  it.each([
    ['email', 'not-an-email'],
    ['date', 'yesterday'],
    ['date-time', 'noon'],
    ['time', '25:00:00Z'],
  ])('both sides assert %s', async (format, value) => {
    expect(rjsfRejects(format, value)).toBe(true)
    expect(await texarynRejects(format, value)).toBe(true)
  })

  /**
   * `uri` is a standard draft-07 format and the adapter leaves assertion on
   * for draft-07, so this is a gap in `json-schema-library` rather than a
   * choice Texaryn made. Not leniency about one value either: nothing in this
   * list is rejected, including the empty string.
   */
  it('does not assert uri, for any value', async () => {
    for (const value of ['not a url', '', ' ', ':::', 'ht tp://x']) {
      expect(await texarynRejects('uri', value), `texaryn rejected ${JSON.stringify(value)}`).toBe(
        false,
      )
      expect(rjsfRejects('uri', value), `rjsf accepted ${JSON.stringify(value)}`).toBe(true)
    }
  })

  /**
   * The one case where Texaryn is stricter, and where it is the correct side.
   *
   * RFC 3339 defines `full-time` as a partial time followed by an offset, so
   * `17:30:00` is not a valid `time` and ajv accepting it is leniency. The
   * consequence still lands on the adopter: `<input type="time">` produces
   * `HH:MM` or `HH:MM:SS` and has no way to emit an offset, so a template
   * field declaring `format: time` is fillable through its natural widget in
   * RJSF and unfillable in Texaryn. Neither library has a bug here; the
   * specification and the HTML control disagree, and the two validators pick
   * different sides.
   */
  it('requires the RFC 3339 offset on time, where ajv does not', async () => {
    expect(await texarynRejects('time', '17:30:00')).toBe(true)
    expect(rjsfRejects('time', '17:30:00')).toBe(false)

    for (const withOffset of ['17:30:00Z', '17:30:00+01:00', '17:30:00.5Z']) {
      expect(await texarynRejects('time', withOffset), withOffset).toBe(false)
      expect(rjsfRejects('time', withOffset), withOffset).toBe(false)
    }

    // Both reject a value with no seconds, so this is about the offset alone.
    expect(await texarynRejects('time', '17:30')).toBe(true)
    expect(rjsfRejects('time', '17:30')).toBe(true)
  })

  /**
   * `data-url` is RJSF's own addition, not a standard format. Ignoring an
   * unknown format is what the specification requires, so Texaryn is right
   * here and RJSF is the one doing something extra. It still means a template
   * relying on it loses that check, which is what makes it worth pinning.
   */
  it('ignores data-url, which is RJSF-specific rather than standard', async () => {
    expect(await texarynRejects('data-url', 'not-a-data-url')).toBe(false)
    expect(rjsfRejects('data-url', 'not-a-data-url')).toBe(true)
  })
})
