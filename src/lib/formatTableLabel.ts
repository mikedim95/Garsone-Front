export function formatTableLabel(
  label?: string | null,
  tablePrefix = 'Table'
): string {
  const prefix = tablePrefix.trim() || 'Table';
  if (!label) return prefix;
  const normalized = label.trim().replace(/\s+/g, ' ');
  // Avoid double prefix when the stored label already includes "table"
  if (/^(table|τραπέζι)\s+/i.test(normalized)) {
    const value = normalized.replace(/^(table|τραπέζι)\s*/i, '').trim();
    return value ? `${prefix} ${value}` : prefix;
  }
  return `${prefix} ${normalized}`;
}
