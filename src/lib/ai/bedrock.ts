// Claude via Amazon Bedrock using a Bedrock API key (bearer token).
// No AWS SDK needed — Bedrock's runtime accepts `Authorization: Bearer <token>`
// and Claude there speaks the standard Anthropic Messages format.

export interface BedrockResult {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

export function bedrockEnabled(): boolean {
  return Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK);
}

function region(): string {
  // Prefer BEDROCK_REGION: on Vercel/Lambda, AWS_REGION is reserved and
  // auto-set to the function's region, which may differ from where Bedrock
  // model access is enabled.
  return process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
}

function modelId(): string {
  // Bedrock model IDs differ from the Anthropic API names and depend on which
  // models are enabled in your account/region. Override with BEDROCK_MODEL_ID.
  return process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-3-5-sonnet-20241022-v2:0";
}

export async function generateWithBedrock(
  prompt: string,
  maxTokens = 300
): Promise<BedrockResult> {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!token) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not set.");

  const id = modelId();
  const url = `https://bedrock-runtime.${region()}.amazonaws.com/model/${encodeURIComponent(
    id
  )}/invoke`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Bedrock invoke failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  return {
    text,
    model: `bedrock:${id}`,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}
