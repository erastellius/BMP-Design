export type PerspectiveHints = {
  sunDirection: string;
  perspectiveHint: string;
  sunAngle: string;
  shadowSoftness: string;
  cameraPerspective: string;
  raw: string;
};

export type InstalledOllamaModel = {
  name: string;
  parameterSize: string;
  fileSize: number;
};

export async function discoverInstalledOllamaModels(): Promise<{
  ollamaOnline: boolean;
  models: InstalledOllamaModel[];
}> {
  try {
    const response = await fetch(`${process.env.OLLAMA_URL || "http://docker.internal"}/api/tags`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) throw new Error(`Ollama model listing failed: ${response.status}`);
    const data = await response.json() as {
      models?: Array<{
        name?: string;
        model?: string;
        size?: number;
        details?: { parameter_size?: string };
      }>;
    };
    const models = (data.models || []).flatMap(model => {
      const name = model.name || model.model;
      if (!name) return [];
      return [{
        name,
        parameterSize: model.details?.parameter_size || "",
        fileSize: typeof model.size === "number" && Number.isFinite(model.size) ? model.size : 0
      }];
    });
    return { ollamaOnline: true, models };
  } catch (error) {
    console.warn("Unable to list installed Ollama models", error);
    return { ollamaOnline: false, models: [] };
  }
}

export async function listInstalledOllamaModels(): Promise<InstalledOllamaModel[]> {
  return (await discoverInstalledOllamaModels()).models;
}

export async function preferredLocalOllamaModel() {
  const models = await listInstalledOllamaModels();
  return models.find(model => model.name === "qwen3.5:4b-mlx")?.name
    || models[0]?.name
    || "qwen3.5:4b-mlx";
}

const defaultAnalysis: PerspectiveHints = {
  sunDirection: "upper-left",
  perspectiveHint: "15deg downward pitch",
  sunAngle: "upper-left",
  shadowSoftness: "soft",
  cameraPerspective: "15deg downward pitch",
  raw: ""
};

export async function analyzePerspective(
  compositeImage: string,
  model = process.env.OLLAMA_MODEL || "qwen2.5vl:3b"
): Promise<PerspectiveHints> {
  try {
    const response = await fetch(`${process.env.OLLAMA_URL || "http://docker.internal"}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
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
