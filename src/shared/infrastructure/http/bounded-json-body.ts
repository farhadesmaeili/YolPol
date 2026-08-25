export type BoundedJsonBodyResult = Readonly<{status: "success"; value: unknown}> | Readonly<{status: "invalid"}> | Readonly<{status: "too_large"}>;

export async function readJsonBodyWithinLimit(request: Request, sizeLimit: number, cancellationReason = "Request body exceeds limit."): Promise<BoundedJsonBodyResult> {
  if (!Number.isSafeInteger(sizeLimit) || sizeLimit < 1) throw new Error("Request size limit must be a positive safe integer.");
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared)) return {status: "invalid"};
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes)) return {status: "invalid"};
    if (declaredBytes > sizeLimit) return {status: "too_large"};
  }
  if (!request.body) return {status: "invalid"};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > sizeLimit) {
        try { await reader.cancel(cancellationReason); } catch { /* The 413 response remains authoritative. */ }
        return {status: "too_large"};
      }
      chunks.push(value);
    }
  } catch { return {status: "invalid"}; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(bytes); } catch { return {status: "invalid"}; }
  try { return {status: "success", value: JSON.parse(text)}; } catch { return {status: "invalid"}; }
}

