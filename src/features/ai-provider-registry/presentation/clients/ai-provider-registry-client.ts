type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AiProviderRegistryMutationResult = Readonly<{status: "saved"}> | Readonly<{status: "conflict" | "invalid" | "forbidden" | "rate_limited" | "failed"}>;

export async function mutateAiProviderRegistry(fetcher: Fetcher, command: Readonly<Record<string, unknown>>): Promise<AiProviderRegistryMutationResult> {
  try {
    const response = await fetcher("/api/staff/ai-providers", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(command)});
    if (response.ok) return {status: "saved"};
    if (response.status === 409) return {status: "conflict"}; if ([400, 413, 415].includes(response.status)) return {status: "invalid"};
    if (response.status === 403) return {status: "forbidden"}; if (response.status === 429) return {status: "rate_limited"}; return {status: "failed"};
  } catch { return {status: "failed"}; }
}
