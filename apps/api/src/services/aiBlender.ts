export async function ollamaScenePrompt(compositeImage: string, mask: string): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://docker.internal";
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "qwen2.5vl:3b",
      prompt: "Create one concise image editing prompt to blend pergola shadows and natural lighting into this backyard scene. Preserve all manufactured pergola geometry. The white mask area may be edited; the black mask area is protected.",
      images: [
        compositeImage.replace(/^data:image\/[^;]+;base64,/, ""),
        mask.replace(/^data:image\/[^;]+;base64,/, "")
      ],
      stream: false,
      keep_alive: "2m"
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Ollama prompt generation failed: ${response.status}`);
  const data = await response.json() as { response?: string };
  return data.response?.trim() || "Photorealistically blend natural pergola shadows and consistent daylight.";
}

function toFile(base64: string, name: string) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "");
  return new File([Buffer.from(clean, "base64")], name);
}

export async function blendWithFal(prompt: string, compositeImage: string, mask: string) {
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY is not configured");
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
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
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
