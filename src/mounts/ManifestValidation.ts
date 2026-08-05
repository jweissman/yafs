export function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}`)
  return value as Record<string, unknown>
}

export function only(value: Record<string, unknown>, keys: string[], name: string) {
  const unknown = Object.keys(value).filter(key => !keys.includes(key))
  if (unknown.length) throw new Error(`Unknown ${name} field: ${unknown.join(', ')} (expected one of: ${keys.join(', ')})`)
}

export function relative(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !value.startsWith('/')
    && !value.split('/').some(part => !part || part === '.' || part === '..')
}
