export type PerspectiveHints = {
  sunDirection: string;
  perspectiveHint: string;
  sunAngle: string;
  shadowSoftness: string;
  cameraPerspective: string;
  raw: string;
};

const defaultAnalysis: PerspectiveHints = {
  sunDirection: "upper-left",
  perspectiveHint: "15deg downward pitch",
  sunAngle: "upper-left",
  shadowSoftness: "soft",
  cameraPerspective: "15deg downward pitch",
  raw: ""
};

export async function analyzePerspective(compositeImage: string): Promise<PerspectiveHints> {
  try {
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
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`Ollama analysis failed: ${response.status}`);
    const data = await response.json() as { response?: string };
    const raw = data.response?.trim() || "";
    const sunDirection = raw.match(/sun[^.\n]*/i)?.[0] || defaultAnalysis.sunDirection;
    const perspectiveHint = raw.match(/(?:camera|perspective)[^.\n]*/i)?.[0] || defaultAnalysis.perspectiveHint;
    return {
      sunDirection,
      perspectiveHint,
      sunAngle: sunDirection,
      shadowSoftness: raw.match(/shadow[^.\n]*/i)?.[0] || defaultAnalysis.shadowSoftness,
      cameraPerspective: perspectiveHint,
      raw
    };
  } catch (error) {
    console.warn("Ollama perspective analysis unavailable; using default scene analysis", error);
    return { ...defaultAnalysis };
  }
}
