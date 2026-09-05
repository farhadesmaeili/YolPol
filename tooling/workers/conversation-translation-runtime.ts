export async function runConversationTranslationWorkerOneShot(input: Readonly<{
  createRuntime(): Readonly<{worker: {execute(): Promise<Readonly<{claimed: number; succeeded: number; failed: number; skipped: number}>>}; close(): Promise<void>}>;
  logger: Readonly<{info(message: string): void; error(message: string): void}>;
}>): Promise<number> {
  let runtime: ReturnType<typeof input.createRuntime> | undefined;
  let code = 0;
  try {
    runtime = input.createRuntime();
    const result = await runtime.worker.execute();
    input.logger.info(JSON.stringify(result));
    if (result.failed > 0) code = 1;
  } catch { input.logger.error("Conversation translation worker failed."); code = 1; }
  finally { try { await runtime?.close(); } catch { code = 1; } }
  return code;
}
