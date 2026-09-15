// Timestamps from the backend are UTC. Show local, short and human.
export function shortDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Hoje, ${time}`;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) + `, ${time}`;
}
