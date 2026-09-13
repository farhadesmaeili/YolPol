export const aiProviderCapabilities = ["TEXT_GENERATION", "TRANSLATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"] as const;
export type AiProviderCapability = (typeof aiProviderCapabilities)[number];

export const initialAiProviderAdapterKeys = ["groq", "openai", "anthropic"] as const;

export type AiGenerationSettings = Readonly<{
  temperature: number | null;
  topP: number | null;
  maxOutputTokens: number;
}>;

export type AiRegistryEntityType = "PROVIDER" | "MODEL_PROFILE" | "CREDENTIAL_REFERENCE";
export type AiRegistryChangeType = "CREATED" | "UPDATED" | "ENABLED" | "DISABLED";
