export function formatTableLabel(label?: string | null): string {
  if (!label) return 'Table';
  const normalized = label.trim().replace(/\s+/g, ' ');
  // Avoid double prefix when the stored label already includes "table"
  if (/^table\s+/i.test(normalized)) {
    return normalized.replace(/^table\s*/i, 'Table ');
  }
  return `Table ${normalized}`;
}
