/** Profile display label only; never substitute a phone, email or account ID. */
export function senderDisplayName(value?: string | null): string {
  const name = (value ?? '').normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const points = Array.from(name);
  return points.length > 80 ? points.slice(0, 77).join('') + '...' : name || 'Someone';
}
