export function formatProgress(a: number, b: number) {
  return `${Math.round((a / b) * 100)}%`
}