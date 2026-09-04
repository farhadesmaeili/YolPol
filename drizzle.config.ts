import {defineConfig} from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required for Drizzle commands.");

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema.ts",
    "./src/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema.ts",
    "./src/features/telegram-staff-onboarding/infrastructure/persistence/postgres/schema/telegram-staff-onboarding-schema.ts",
    "./src/features/ai-operations/infrastructure/persistence/postgres/schema/ai-operations-schema.ts",
    "./src/features/ai-provider-registry/infrastructure/persistence/postgres/schema/ai-provider-registry-schema.ts",
    "./src/features/ai-provider-gateway/infrastructure/persistence/postgres/schema/ai-provider-gateway-schema.ts",
    "./src/features/conversation-ai-routing/infrastructure/persistence/postgres/schema/conversation-ai-routing-schema.ts",
  ],
  out: "./drizzle",
  dbCredentials: {url: databaseUrl},
  strict: true,
  verbose: true,
});
