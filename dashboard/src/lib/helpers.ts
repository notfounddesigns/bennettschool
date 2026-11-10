export function fmtFloat(val: number | string, p = 2): string {
  return Number.parseFloat(String(val)).toFixed(p)
}

export function scoreToLetter(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
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

// 'YYYY-MM-DD' in local time (todayIso() is UTC).
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ISO timestamp → "HH:MM" local time, for <input type="time"> values.
export function isoToTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ISO timestamp → "09:05 AM", or an em dash when missing.
export function punchTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
