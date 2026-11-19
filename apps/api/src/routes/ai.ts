import type { FastifyInstance } from "fastify";
import { analyzePerspective, discoverInstalledOllamaModels, preferredLocalOllamaModel } from "../services/ollamaAnalyzer";
import {
  analyzeSceneWithOllama,
  blendWithFal,
  blendWithOpenAI,
  createCloudBlendPrompt,
  hasValidAiProviderKey,
  MISSING_AI_KEY_ERROR
} from "../services/aiBlender";

export async function aiRoutes(app: FastifyInstance) {
  app.get("/api/ai/models", async (_request, reply) => {
    const { ollamaOnline, models: localModels } = await discoverInstalledOllamaModels();
    return reply.send({
      ollamaOnline,
      models: [
        ...localModels.map(model => ({
          id: `ollama:${model.name}`,
          name: model.name,
          provider: "ollama" as const,
          parameterSize: model.parameterSize,
          fileSize: model.fileSize,
          configured: true
        })),
        {
          id: "cloud:flux-fill",
          name: "Flux Fill Pro",
          provider: "cloud" as const,
          configured: hasValidAiProviderKey("fal")
        },
        {
          id: "cloud:openai",
          name: "OpenAI GPT-Image-1",
          provider: "cloud" as const,
          configured: hasValidAiProviderKey("openai")
        }
      ]
    });
  });

  app.post("/api/analyze-perspective", async (request, reply) => {
    const { compositeImage, model: requestedModel } = request.body as { compositeImage?: string; model?: string };
    if (!compositeImage) return reply.code(400).send({ error: "compositeImage is required" });
    if (requestedModel !== undefined && (typeof requestedModel !== "string" || !requestedModel.trim())) {
      return reply.code(400).send({ error: "model must be a non-empty string" });
    }
    const modelName = typeof requestedModel === "string" ? requestedModel : undefined;
    if (modelName && !modelName.startsWith("ollama:") && !modelName.startsWith("cloud:")) {
      return reply.code(400).send({ error: "model must start with 'ollama:' or 'cloud:'" });
    }
    if (modelName?.startsWith("cloud:") &&
        modelName !== "cloud:flux-fill" &&
        modelName !== "cloud:openai") {
      return reply.code(400).send({ error: "Cloud model must be 'cloud:flux-fill' or 'cloud:openai'" });
    }
    try {
      const model = modelName?.startsWith("ollama:")
        ? modelName.slice("ollama:".length)
        : await preferredLocalOllamaModel();
      if (!model) return reply.code(400).send({ error: "Ollama model name is required" });
      const analysis = await analyzePerspective(compositeImage, model);
      return reply.send({ ...analysis, modelUsed: `ollama:${model}` });
    } catch (error: any) {
      return reply.code(502).send({ error: error.message });
    }
  });

  app.post("/api/blend", async (request, reply) => {
    const { compositeImage, mask, model: requestedModel, mode: requestedMode } = request.body as {
      compositeImage?: string;
      mask?: string;
      model?: unknown;
      mode?: "local" | "cloud";
    };
    if (!compositeImage) return reply.code(400).send({ error: "compositeImage is required" });
    if (requestedModel !== undefined && (typeof requestedModel !== "string" || !requestedModel.trim())) {
      return reply.code(400).send({ error: "model must be a non-empty string" });
    }
    const modelName = typeof requestedModel === "string" ? requestedModel : undefined;
    if (modelName && !modelName.startsWith("ollama:") && !modelName.startsWith("cloud:")) {
      return reply.code(400).send({ error: "model must start with 'ollama:' or 'cloud:'" });
    }
    if (requestedMode !== undefined && requestedMode !== "local" && requestedMode !== "cloud") {
      return reply.code(400).send({ error: "mode must be 'local' or 'cloud'" });
    }

    const provider = process.env.AI_PROVIDER || "fal";
    const model = modelName
      || (requestedMode === "cloud"
        ? `cloud:${provider === "fal" ? "flux-fill" : "openai"}`
        : requestedMode === "local" || !hasValidAiProviderKey(provider)
          ? "ollama:qwen3.5:4b-mlx"
          : `cloud:${provider === "fal" ? "flux-fill" : "openai"}`);
    if (model.startsWith("ollama:")) {
      const ollamaModel = model.slice("ollama:".length);
      if (!ollamaModel) return reply.code(400).send({ error: "Ollama model name is required" });
      const lightingParams = await analyzeSceneWithOllama(compositeImage, ollamaModel);
      return reply.send({
        mode: "local",
        modelUsed: model,
        lightingParams,
        edgePrompt: `Apply local pergola lighting: ${lightingParams.lightingSummary}`
      });
    }

    const cloudProvider = model.slice("cloud:".length);
    if (cloudProvider !== "flux-fill" && cloudProvider !== "openai") {
      return reply.code(400).send({ error: "Cloud model must be 'cloud:flux-fill' or 'cloud:openai'" });
    }
    const providerKey = cloudProvider === "flux-fill" ? "fal" : "openai";
    if (!mask) return reply.code(400).send({ error: "mask is required for cloud AI" });
    if (!hasValidAiProviderKey(providerKey)) {
      return reply.code(400).send({ error: MISSING_AI_KEY_ERROR });
    }
    try {
      const localModel = await preferredLocalOllamaModel();
      const lightingParams = await analyzeSceneWithOllama(compositeImage, localModel);
      const prompt = createCloudBlendPrompt(lightingParams.lightingSummary);
      const result = cloudProvider === "flux-fill"
        ? await blendWithFal(prompt, compositeImage, mask)
        : await blendWithOpenAI(prompt, compositeImage, mask);
      return reply.send({ mode: "cloud", modelUsed: model, imageUrl: result, prompt, lightingParams });
    } catch (error: any) {
      return reply.code(502).send({ error: error.message });
    }
  });
}
