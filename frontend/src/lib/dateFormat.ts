// Convert PGN date "YYYY.MM.DD" → display "DD.MM.YYYY".
// Accepts partial PGN dates with "?" tokens (e.g. "2025.??.??") and returns input unchanged when format doesn't match.
export function formatPgnDate(date: string | null | undefined): string {
  if (!date) return '';
  const m = date.match(/^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/);
  if (!m) return date;
  const [, y, mo, d] = m;
  if (mo === '??' && d === '??') return y;
  if (d === '??') return `${mo}.${y}`;
  return `${d}.${mo}.${y}`;
}
