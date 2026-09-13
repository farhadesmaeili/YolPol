export const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];
export type LogFields = Readonly<Record<string, unknown>>;

export type StructuredLogger = Readonly<{
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}>;

type LogDestination = Readonly<{
  debug(line: string): void;
  info(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}>;

type LoggerEnvironment = Readonly<{
  NODE_ENV?: string;
  YOLPOL_LOG_LEVEL?: string;
}>;

const redacted = "[REDACTED]";
const maximumDepth = 5;
const maximumArrayItems = 20;
const eventPattern = /^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9])?$/u;
const safeErrorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/u;

const levelPriority: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return normalized.includes("secret")
    || normalized.includes("password")
    || normalized.includes("authorization")
    || normalized.includes("cookie")
    || normalized.includes("apikey")
    || normalized === "token"
    || normalized.endsWith("token")
    || normalized === "credentials"
    || normalized === "credential"
    || normalized.endsWith("credential")
    || normalized === "databaseurl"
    || normalized === "connectionstring"
    || normalized === "body"
    || normalized.endsWith("body")
    || normalized === "message"
    || normalized.endsWith("message")
    || normalized === "content"
    || normalized.endsWith("content")
    || normalized === "prompt"
    || normalized.endsWith("prompt")
    || normalized === "response"
    || normalized === "email"
    || normalized.endsWith("email")
    || normalized === "phone"
    || normalized.endsWith("phone")
    || normalized.includes("price")
    || normalized.includes("cost")
    || normalized.includes("margin");
}

function safeError(error: Error): Readonly<Record<string, unknown>> {
  const code = Reflect.get(error, "code");
  return Object.freeze({
    name: error.name || "Error",
    ...(typeof code === "string" && safeErrorCodePattern.test(code) ? {code} : {}),
  });
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return safeError(value);
  if (depth >= maximumDepth) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, maximumArrayItems).map((item) => redactValue(item, seen, depth + 1));
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return "[UNSUPPORTED_OBJECT]";
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const safeValue = isSensitiveKey(key) ? redacted : redactValue(item, seen, depth + 1);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }
  return sanitized;
}

export function parseLogLevel(value: string | undefined): LogLevel {
  const candidate = value?.trim().toLowerCase() || "info";
  if ((logLevels as readonly string[]).includes(candidate)) return candidate as LogLevel;
  throw new Error("YOLPOL_LOG_LEVEL must be debug, info, warn, or error.");
}

export function redactLogFields(fields: LogFields): LogFields {
  return Object.freeze(redactValue(fields, new WeakSet(), 0) as Record<string, unknown>);
}

export function createStructuredLogger(input: Readonly<{
  service: string;
  environment?: LoggerEnvironment;
  destination?: LogDestination;
  now?: () => Date;
}>): StructuredLogger {
  if (!eventPattern.test(input.service)) throw new Error("Structured logger service is invalid.");
  const environment = input.environment ?? process.env;
  const minimumLevel = parseLogLevel(environment.YOLPOL_LOG_LEVEL);
  const destination = input.destination ?? console;
  const now = input.now ?? (() => new Date());

  const write = (level: LogLevel, event: string, fields: LogFields = {}) => {
    if (levelPriority[level] < levelPriority[minimumLevel]) return;
    const safeEvent = eventPattern.test(event) ? event : "application.invalid_log_event";
    const safeFields = redactLogFields(fields);
    const record = {
      timestamp: now().toISOString(),
      level,
      event: safeEvent,
      service: input.service,
      requestId: null,
      ...safeFields,
    };
    destination[level](JSON.stringify(record));
  };

  return Object.freeze({
    debug: (event, fields) => { write("debug", event, fields); },
    info: (event, fields) => { write("info", event, fields); },
    warn: (event, fields) => { write("warn", event, fields); },
    error: (event, fields) => { write("error", event, fields); },
  });
}
