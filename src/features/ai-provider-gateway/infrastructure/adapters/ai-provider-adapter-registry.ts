import type {AiProviderAdapter, AiProviderAdapterResolver} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";

export class AiProviderAdapterRegistry implements AiProviderAdapterResolver {
  private readonly adapters: ReadonlyMap<string, AiProviderAdapter>;

  constructor(adapters: readonly AiProviderAdapter[]) {
    const entries = new Map<string, AiProviderAdapter>();
    for (const adapter of adapters) {
      if (entries.has(adapter.adapterKey)) throw new Error("Duplicate AI provider adapter key.");
      entries.set(adapter.adapterKey, adapter);
    }
    this.adapters = entries;
  }

  resolve(adapterKey: string): AiProviderAdapter | null {
    return this.adapters.get(adapterKey) ?? null;
  }
}
