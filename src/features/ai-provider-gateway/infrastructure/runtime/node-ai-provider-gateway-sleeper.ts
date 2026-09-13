import type {AiProviderGatewaySleeper} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";

export class NodeAiProviderGatewaySleeper implements AiProviderGatewaySleeper {
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error("cancelled")); return; }
      const timeout = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, milliseconds);
      const cancel = () => { clearTimeout(timeout); reject(new Error("cancelled")); };
      signal?.addEventListener("abort", cancel, {once: true});
    });
  }
}
