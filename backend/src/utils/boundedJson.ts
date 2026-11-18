export async function boundedJson(response: Response) {
  if (!response.body) throw Error('Missing response');
  const reader = response.body.getReader();
  let count = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > 65536) throw Error('Response too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
      string,
      unknown
    >;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
