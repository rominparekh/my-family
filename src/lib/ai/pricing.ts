// Pricing tables for cost attribution. Keep these current with provider pricing.
// Text prices are USD per million tokens (MTok). Update as models/prices change.

export interface TextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

interface TextPrice {
  input: number; // $ / MTok
  output: number; // $ / MTok
  cacheRead: number; // $ / MTok
  cacheWrite: number; // $ / MTok
}

// Anthropic list prices ($/MTok). Approximate; confirm against current pricing.
const TEXT_PRICES: Record<string, TextPrice> = {
  "claude-opus-4-8": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
};

const DEFAULT_TEXT_PRICE: TextPrice = TEXT_PRICES["claude-sonnet-4-6"];

export function textCostUsd(model: string, usage: TextUsage): number {
  const p = TEXT_PRICES[model] ?? DEFAULT_TEXT_PRICE;
  const m = 1_000_000;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      (usage.cacheReadTokens ?? 0) * p.cacheRead +
      (usage.cacheWriteTokens ?? 0) * p.cacheWrite) /
    m
  );
}

// Per-unit media prices ($ per image / per generated video). Stub is free.
const IMAGE_UNIT_PRICE: Record<string, number> = {
  stub: 0,
  replicate: 0.0035, // e.g. SDXL-class; adjust per chosen model
  firefly: 0.02,
};

const VIDEO_UNIT_PRICE: Record<string, number> = {
  stub: 0,
  replicate: 0.5, // short clip; highly model-dependent — adjust
  firefly: 0.6,
};

export function imageCostUsd(provider: string, units: number): number {
  return (IMAGE_UNIT_PRICE[provider] ?? 0) * units;
}

export function videoCostUsd(provider: string, units: number): number {
  return (VIDEO_UNIT_PRICE[provider] ?? 0) * units;
}
