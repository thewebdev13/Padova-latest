export async function readJSON(request: Request, limit = 100000): Promise<any> {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body required');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
