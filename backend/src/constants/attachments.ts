export const MiB = 1024 * 1024;
export const attachmentLimits = { count: 10, draftBytes: 100 * MiB, accountBytes: 500 * MiB, totalBytes: 2 * 1024 * MiB, reservationMs: 86400000, leaseMs: 15 * 60000 } as const;
export const mimeLimits: Readonly<Record<string, number>> = {
  'image/jpeg': 10 * MiB, 'image/png': 10 * MiB, 'image/webp': 10 * MiB,
  'video/mp4': 50 * MiB, 'video/quicktime': 50 * MiB, 'video/webm': 50 * MiB,
  'audio/mp4': 10 * MiB, 'audio/mpeg': 10 * MiB, 'audio/wav': 10 * MiB, 'audio/webm': 10 * MiB,
  'application/pdf': 20 * MiB, 'text/plain': MiB,
};
