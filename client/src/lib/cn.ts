// Utility for merging Tailwind classes cleanly
// Prevents duplicate/conflicting class names
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
