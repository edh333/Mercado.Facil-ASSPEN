export function idResumo(id: string | number, chars = 8): string {
  return `#${String(id).slice(0, chars).toUpperCase()}`;
}