// Minimal structured logger. Emits single-line JSON so Vercel/any log drain can
// parse and index fields (level, msg, and arbitrary context like draftId/runId).
// Centralized so we can later swap in a real sink (Axiom, Datadog, OTel) in one place.

type Level = "debug" | "info" | "warn" | "error";

type Context = Record<string, unknown>;

function emit(level: Level, msg: string, ctx?: Context) {
  const line = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...sanitize(ctx),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

// Never let secrets leak into logs; redact obvious sensitive keys.
const REDACT = /(token|secret|authorization|password|code)/i;
function sanitize(ctx?: Context): Context {
  if (!ctx) return {};
  const out: Context = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

export const log = {
  debug: (msg: string, ctx?: Context) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Context) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Context) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Context) => emit("error", msg, ctx),
  /** Returns a child logger that stamps every line with the given context. */
  child(base: Context) {
    return {
      debug: (msg: string, ctx?: Context) => emit("debug", msg, { ...base, ...ctx }),
      info: (msg: string, ctx?: Context) => emit("info", msg, { ...base, ...ctx }),
      warn: (msg: string, ctx?: Context) => emit("warn", msg, { ...base, ...ctx }),
      error: (msg: string, ctx?: Context) => emit("error", msg, { ...base, ...ctx }),
    };
  },
};
