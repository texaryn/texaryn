import { describe, expect, it } from 'vitest'
import { inspect } from '../serialize.js'

describe('inspect', () => {
  it('uses a consistent alphabetic order for object keys', () => {
    const parsed = JSON.parse(inspect({ zebra: 1, alpha: 2 }))

    expect(Object.keys(parsed)).toEqual(['alpha', 'zebra'])
  })
})
