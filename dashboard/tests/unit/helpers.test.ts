import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fmtFloat,
  formatSimpleDate,
  getInitials,
  isoToTimeInput,
  localDateStr,
  punchTime,
  scoreToLetter,
  toTitleCase,
  todayIso,
} from '../../src/lib/helpers.ts'

// vitest.config.ts pins TZ=America/Chicago (UTC-6 in November).

describe('fmtFloat', () => {
  it('formats to 2 decimals by default', () => {
    expect(fmtFloat(1)).toBe('1.00')
    expect(fmtFloat(12.345)).toBe('12.35')
  })

  it('accepts numeric strings and a custom precision', () => {
    expect(fmtFloat('7.5', 1)).toBe('7.5')
    expect(fmtFloat('3', 0)).toBe('3')
  })

  it('returns "NaN" for non-numeric input', () => {
    expect(fmtFloat('abc')).toBe('NaN')
  })
})

describe('scoreToLetter', () => {
  it.each([
    [100, 'A'], [90, 'A'],
    [89.99, 'B'], [80, 'B'],
    [79, 'C'], [70, 'C'],
    [69, 'D'], [60, 'D'],
    [59.9, 'F'], [0, 'F'],
  ] as const)('%d → %s', (score, letter) => {
    expect(scoreToLetter(score)).toBe(letter)
  })
})

describe('formatSimpleDate', () => {
  it('formats a plain date without shifting it a day back', () => {
    // A bare date parses as UTC midnight; formatting in UTC keeps it on Mar 5
    // even though Chicago is still Mar 4 at that instant.
    expect(formatSimpleDate('2026-03-05')).toBe('Mar 5, 2026')
  })
})

describe('getInitials', () => {
  it('uses the first letter of the first two words', () => {
    expect(getInitials('jane smith')).toBe('JS')
    expect(getInitials('Mary Ann Jones')).toBe('MA')
  })

  it('handles a single name', () => {
    expect(getInitials('Cher')).toBe('C')
  })

  it('falls back to ?? for an empty name', () => {
    expect(getInitials('')).toBe('??')
  })
})

describe('toTitleCase', () => {
  it('capitalizes each word, including after an apostrophe', () => {
    expect(toTitleCase("o'neal smith")).toBe("O'Neal Smith")
  })
})

describe('local vs UTC dates', () => {
  afterEach(() => { vi.useRealTimers() })

  it('localDateStr pads month and day', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('differ in the evening: todayIso is UTC, localDateStr is local', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 11:30 PM on Nov 9 in Chicago is already Nov 10 in UTC.
    vi.setSystemTime(new Date('2026-11-10T05:30:00Z'))
    expect(localDateStr()).toBe('2026-11-09')
    expect(todayIso()).toBe('2026-11-10')
  })
})

describe('isoToTimeInput', () => {
  it('converts to local HH:MM for <input type="time">', () => {
    expect(isoToTimeInput('2026-11-09T15:05:00Z')).toBe('09:05')
    expect(isoToTimeInput('2026-11-09T04:00:00Z')).toBe('22:00')
  })
})

describe('punchTime', () => {
  it('formats a local 12-hour time', () => {
    // \s also matches the narrow no-break space newer ICU puts before AM/PM.
    expect(punchTime('2026-11-09T15:05:00Z')).toMatch(/^09:05\sAM$/u)
  })

  it('shows an em dash when there is no punch', () => {
    expect(punchTime(null)).toBe('—')
    expect(punchTime(undefined)).toBe('—')
    expect(punchTime('')).toBe('—')
  })
})
