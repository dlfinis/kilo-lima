// Date utility helpers shared across composables.
// Returns today's date as a YYYY-MM-DD string.
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}
