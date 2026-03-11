export function formatDateTime(date: Date | string): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day    = String(d.getDate()).padStart(2, '0');
  const month  = String(d.getMonth() + 1).padStart(2, '0');
  const year   = d.getFullYear();
  const hours  = String(d.getHours()).padStart(2, '0');
  const mins   = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

export function formatDate(date: Date | string): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
}
