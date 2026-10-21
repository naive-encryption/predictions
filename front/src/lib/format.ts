export function countdown(iso?: string, now = Date.now()) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

const df = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const dtf = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const date = (iso: string) => df.format(new Date(iso))
export const dateTime = (iso: string) => dtf.format(new Date(iso))
export const dateRange = (a: string, b: string) => `${date(a)} – ${date(b)}`

// <input type="datetime-local"> works in local time without a zone.
export function toLocalInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '')

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
