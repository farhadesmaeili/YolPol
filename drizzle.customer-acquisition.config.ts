import {defineConfig} from "drizzle-kit";

// Generation/checking are offline. Applying migrations uses the separate guarded runner.
export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/features/customer-acquisition/infrastructure/persistence/postgres/schema/acquisition-schema.ts",
    "./src/features/customer-acquisition/infrastructure/persistence/postgres/schema/discovery-schema.ts",
  ],
  out: "./drizzle-customer-acquisition",
  strict: true,
  verbose: true,
});
