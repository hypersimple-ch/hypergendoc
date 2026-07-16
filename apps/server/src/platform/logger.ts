import type { ActorContext, RequestContext } from "./context.js";

export type LogFields = Readonly<Record<string, unknown>>;
export interface StructuredLogger {
  child(context: Partial<RequestContext>): StructuredLogger;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}
export interface LogSink {
  write(record: Readonly<Record<string, unknown>>): void;
}
const secretKey =
  /password|token|authorization|cookie|secret|signed.?url|reset.?link|document.?body|resolved.?source|compiler|filename|title/i;
export function redact(value: unknown, key = ""): unknown {
  if (secretKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redact(item, name)]),
    );
  return value;
}
function actorFields(actor: ActorContext | undefined): LogFields {
  if (actor?.type === "human")
    return { actorId: actor.userId, workspaceId: actor.workspaceId };
  if (actor?.type === "agent")
    return { credentialId: actor.credentialId, workspaceId: actor.workspaceId };
  return {};
}
export function createStructuredLogger(
  sink: LogSink,
  context: Partial<RequestContext> = {},
): StructuredLogger {
  const base = {
    requestId: context.requestId,
    workspaceId: context.workspaceId,
    ...actorFields(context.actor),
  };
  const write = (level: string, event: string, fields: LogFields = {}) =>
    sink.write(
      redact({ level, event, ...base, ...fields }) as Readonly<
        Record<string, unknown>
      >,
    );
  return {
    child: (child) => createStructuredLogger(sink, { ...context, ...child }),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}
export function createConsoleLogger(): StructuredLogger {
  return createStructuredLogger({
    write: (record) => console.log(JSON.stringify(record)),
  });
}
