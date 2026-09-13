import {loadEnvConfig} from "@next/env";

type DevelopmentEnvironment = Readonly<Record<string, string | undefined>>;
type NextEnvironmentLoader = (projectDirectory: string, development: boolean) => unknown;

export function loadDevelopmentEnv(options: Readonly<{
  environment?: DevelopmentEnvironment;
  loadEnvironment?: NextEnvironmentLoader;
  projectDirectory?: string;
}> = {}): void {
  const environment = options.environment ?? process.env;
  if (environment.NODE_ENV === "production") return;

  const loadEnvironment = options.loadEnvironment ?? loadEnvConfig;
  loadEnvironment(options.projectDirectory ?? process.cwd(), true);
}
