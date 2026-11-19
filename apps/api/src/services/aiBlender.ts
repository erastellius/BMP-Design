export const MISSING_AI_KEY_ERROR = "Missing valid FAL_KEY or OPENAI_API_KEY in .env. Add a valid provider key to apps/api/.env and restart the API.";

export type LightingParams = {
  sunDirection: string;
  shadowAngleDeg: number;
  shadowBlur: number;
  shadowOpacity: number;
  ambientTintHex: string;
  ambientTemp: string;
  brightness: number;
  contrast: number;
  suggestedSkewY: number;
  perspectiveMatch: string;
  lightingSummary: string;
  fullReasoning: string;
};

const defaultLightingParams: LightingParams = {
  sunDirection: "Upper-left",
  shadowAngleDeg: 135,
  shadowBlur: 14,
  shadowOpacity: 0.35,
  ambientTintHex: "#E8D6B8",
  ambientTemp: "Warm natural daylight",
  brightness: 0.04,
  contrast: 4,
  suggestedSkewY: 0,
  perspectiveMatch: "Perspective retained from the uploaded scene.",
  lightingSummary: "Applied balanced natural daylight with a soft pergola shadow.",
  fullReasoning: "The scene could not be analyzed, so balanced default pergola lighting was applied."
};

export function hasValidAiProviderKey(provider = process.env.AI_PROVIDER || "fal") {
  const key = provider === "fal" ? process.env.FAL_KEY : process.env.OPENAI_API_KEY;
  const normalizedKey = key?.trim().toLowerCase();
  return !!normalizedKey &&
    !/^your_.+_api_key_here$/.test(normalizedKey) &&
    !["replace_me", "changeme", "placeholder"].includes(normalizedKey);
}

function finiteInRange(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function readLightingParams(value: unknown): LightingParams {
  if (!value || typeof value !== "object") return { ...defaultLightingParams };
  const parsed = value as Partial<LightingParams>;
  return {
    sunDirection: typeof parsed.sunDirection === "string" && parsed.sunDirection.trim()
      ? parsed.sunDirection.trim().slice(0, 120)
      : defaultLightingParams.sunDirection,
    shadowAngleDeg: finiteInRange(parsed.shadowAngleDeg, 0, 360, defaultLightingParams.shadowAngleDeg),
    shadowBlur: finiteInRange(parsed.shadowBlur, 0, 50, defaultLightingParams.shadowBlur),
    shadowOpacity: finiteInRange(parsed.shadowOpacity, 0, 1, defaultLightingParams.shadowOpacity),
    ambientTintHex: typeof parsed.ambientTintHex === "string" && /^#[\da-f]{6}$/i.test(parsed.ambientTintHex)
      ? parsed.ambientTintHex
      : defaultLightingParams.ambientTintHex,
    ambientTemp: typeof parsed.ambientTemp === "string" && parsed.ambientTemp.trim()
      ? parsed.ambientTemp.trim().slice(0, 120)
      : defaultLightingParams.ambientTemp,
    brightness: finiteInRange(parsed.brightness, -0.2, 0.2, defaultLightingParams.brightness),
    contrast: finiteInRange(parsed.contrast, -20, 20, defaultLightingParams.contrast),
    suggestedSkewY: finiteInRange(parsed.suggestedSkewY, -0.5, 0.5, defaultLightingParams.suggestedSkewY),
    perspectiveMatch: typeof parsed.perspectiveMatch === "string" && parsed.perspectiveMatch.trim()
      ? parsed.perspectiveMatch.trim().slice(0, 200)
      : defaultLightingParams.perspectiveMatch,
    lightingSummary: typeof parsed.lightingSummary === "string" && parsed.lightingSummary.trim()
      ? parsed.lightingSummary.trim().slice(0, 300)
      : defaultLightingParams.lightingSummary,
    fullReasoning: typeof parsed.fullReasoning === "string" && parsed.fullReasoning.trim()
      ? parsed.fullReasoning.trim().slice(0, 1500)
      : defaultLightingParams.fullReasoning
  };
}

export async function analyzeSceneWithOllama(
  compositeImage: string,
  model = "qwen3.5:4b-mlx"
): Promise<LightingParams> {
  try {
    const response = await fetch(`${process.env.OLLAMA_URL || "http://docker.internal"}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: [
          "Analyze the pergola scene lighting and return only a JSON object with these fields:",
          "sunDirection (short description),",
          "shadowAngleDeg (number, 0-360), shadowBlur (number, 0-50), shadowOpacity (number, 0-1),",
          "ambientTintHex (six-digit hex color), ambientTemp (short color-temperature description),",
          "brightness (number, -0.2 to 0.2), contrast (number, -20 to 20),",
          "suggestedSkewY (number, -0.5 to 0.5), perspectiveMatch (short perspective description),",
          "lightingSummary (one concise sentence), fullReasoning (brief explanation of the scene and chosen adjustments)."
        ].join(" "),
        images: [compositeImage.replace(/^data:image\/[^;]+;base64,/, "")],
        format: "json",
        stream: false,
        keep_alive: "2m"
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Ollama scene analysis failed: ${response.status}`);
    const data = await response.json() as { response?: string };
    if (!data.response) throw new Error("Ollama returned no scene lighting analysis");
    return readLightingParams(JSON.parse(data.response));
  } catch (error) {
    console.warn("Ollama scene analysis unavailable; using default lighting parameters", error);
    return { ...defaultLightingParams };
  }
}

export function createCloudBlendPrompt(lightingSummary: string) {
  return [
    "Blend the placed cedar pergola beams and black steel brackets seamlessly into the backyard in front of the house.",
    "Cast realistic natural sunlight shadows onto the dirt ground and house wall while preserving the exact structural shape and hardware details of the placed components.",
    `Match the scene lighting analyzed locally by Ollama: ${lightingSummary}`
  ].join(" ");
}

function toFile(base64: string, name: string) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "");
  return new File([Buffer.from(clean, "base64")], name);
}

export async function blendWithFal(prompt: string, compositeImage: string, mask: string) {
  if (!hasValidAiProviderKey("fal")) throw new Error(MISSING_AI_KEY_ERROR);
  const response = await fetch("https://fal.run/fal-ai/flux-pro/v1/fill", {
    method: "POST",
    headers: { authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_url: compositeImage,
      mask_url: mask,
      output_format: "jpeg",
      num_images: 1
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(`Fal.ai blend failed: ${response.status}`);
  const data = await response.json() as { images?: Array<{ url: string }> };
  if (!data.images?.[0]?.url) throw new Error("Fal.ai returned no image");
  return data.images[0].url;
}

export async function blendWithOpenAI(prompt: string, compositeImage: string, mask: string) {
  if (!hasValidAiProviderKey("openai")) throw new Error(MISSING_AI_KEY_ERROR);
  const form = new FormData();
  form.set("model", "gpt-image-1");
  form.set("prompt", prompt);
  form.set("image", toFile(compositeImage, "composite.png"));
  form.set("mask", toFile(mask, "mask.png"));
  form.set("size", "1024x1024");
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(`OpenAI blend failed: ${response.status}`);
  const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const image = data.data?.[0];
  return image?.b64_json ? `data:image/png;base64,${image.b64_json}` : image?.url;
}
