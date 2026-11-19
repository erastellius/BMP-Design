export type PerspectiveHints = {
  sunAngle: string;
  shadowSoftness: string;
  cameraPerspective: string;
  raw: string;
};

export async function analyzePerspective(compositeImage: string): Promise<PerspectiveHints> {
  const response = await fetch(`${process.env.OLLAMA_URL || "http://docker.internal"}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "qwen2.5vl:3b",
      prompt: "Analyze this backyard pergola composite image. Report: sun angle, shadow softness, and camera perspective hints. Return concise plain text.",
      images: [compositeImage.replace(/^data:image\/[^;]+;base64,/, "")],
      stream: false,
      keep_alive: "2m"
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Ollama analysis failed: ${response.status}`);
  const data = await response.json() as { response?: string };
  const raw = data.response?.trim() || "";
  return {
    sunAngle: raw.match(/sun[^.\n]*/i)?.[0] || "unknown",
    shadowSoftness: raw.match(/shadow[^.\n]*/i)?.[0] || "soft",
    cameraPerspective: raw.match(/(?:camera|perspective)[^.\n]*/i)?.[0] || "perspective",
    raw
  };
}
