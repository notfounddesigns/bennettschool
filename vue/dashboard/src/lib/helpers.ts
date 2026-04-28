export function nDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function fmtFloat(val: number | string, p = 2): string {
  return Number.parseFloat(String(val)).toFixed(p)
}

export function scoreToLetter(score: number): 'A' | 'B' | 'C' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  return 'F'
}

export function formatSimpleDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() ?? '')
      .join('') || '??'
  )
}

export function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
