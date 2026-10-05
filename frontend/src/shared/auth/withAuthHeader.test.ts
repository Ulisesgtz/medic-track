import { describe, it, expect } from 'vitest'
import { withAuthHeader } from './withAuthHeader'

describe('withAuthHeader', () => {
  it('builds a Bearer Authorization header from a token', () => {
    expect(withAuthHeader('abc123')).toEqual({ Authorization: 'Bearer abc123' })
  })

  it('returns an empty object when there is no token', () => {
    expect(withAuthHeader(null)).toEqual({})
  })
})
