import { describe, expect, it } from 'vitest'
import { compareObjectKeys } from '../compare-object-keys.js'

describe('compareObjectKeys', () => {
  it('matches the default UTF-16 code-unit ordering', () => {
    expect(['a', 'ä', 'B', '2', '10'].sort(compareObjectKeys))
      .toEqual(['10', '2', 'B', 'a', 'ä'])
  })
})
