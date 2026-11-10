import { describe, expect, it } from 'vitest'
import { formatTime, getInitials } from '../../src/lib/helpers.ts'

// vitest.config.ts pins TZ=America/Chicago.

describe('getInitials', () => {
  it('uses the first letter of the first two words', () => {
    expect(getInitials('jane smith')).toBe('JS')
    expect(getInitials('Mary Ann Jones')).toBe('MA')
  })

  it('falls back to ?? for an empty name', () => {
    expect(getInitials('')).toBe('??')
  })
})

describe('formatTime', () => {
  it('formats local time without a leading zero', () => {
    // \s also matches the narrow no-break space newer ICU puts before AM/PM.
    expect(formatTime(new Date('2026-11-09T15:05:00Z'))).toMatch(/^9:05\sAM$/u)
    expect(formatTime(new Date('2026-11-09T22:30:00Z'))).toMatch(/^4:30\sPM$/u)
  })
})
