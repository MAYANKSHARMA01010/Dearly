// GSM 03.38 default and extension tables. Extensions consume two septets and
// cannot straddle a concatenated SMS boundary. Unicode counts UTF-16 code units.
const basic = new Set(
  Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'),
);
const extension = new Set(Array.from('\f^{}\\[~]|€'));

export function smsSegments(text: string) {
  const characters = Array.from(text);
  const gsm = characters.every((c) => basic.has(c) || extension.has(c));
  const widths = characters.map((c) => gsm ? (extension.has(c) ? 2 : 1) : c.length);
  const units = widths.reduce((a, b) => a + b, 0);
  const single = gsm ? 160 : 70;
  if (units <= single)
    return { encoding: gsm ? 'GSM-7' as const : 'UTF-16' as const, units, segments: units ? 1 : 0 };
  const capacity = gsm ? 153 : 67;
  let segments = 1, used = 0;
  for (const width of widths) {
    if (used + width > capacity) { segments++; used = 0; }
    used += width;
  }
  return { encoding: gsm ? 'GSM-7' as const : 'UTF-16' as const, units, segments };
}
