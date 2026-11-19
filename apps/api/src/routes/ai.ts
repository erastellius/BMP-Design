import type { FastifyInstance } from "fastify";
import { analyzePerspective } from "../services/ollamaAnalyzer";
import { blendWithFal, blendWithOpenAI, hasValidAiProviderKey, MISSING_AI_KEY_ERROR, ollamaScenePrompt } from "../services/aiBlender";

export async function aiRoutes(app: FastifyInstance) {
  app.post("/api/analyze-perspective", async (request, reply) => {
    const { compositeImage } = request.body as { compositeImage?: string };
    if (!compositeImage) return reply.code(400).send({ error: "compositeImage is required" });
    try {
      return reply.send(await analyzePerspective(compositeImage));
    } catch (error: any) {
      return reply.code(502).send({ error: error.message });
    }
  });

  app.post("/api/blend", async (request, reply) => {
    const { compositeImage, mask } = request.body as { compositeImage?: string; mask?: string };
    if (!compositeImage || !mask) return reply.code(400).send({ error: "compositeImage and mask are required" });
    const provider = process.env.AI_PROVIDER || "fal";
    if (!hasValidAiProviderKey(provider)) {
      return reply.code(400).send({ error: MISSING_AI_KEY_ERROR });
    }
    try {
      const prompt = await ollamaScenePrompt(compositeImage, mask);
      const result = provider === "fal"
        ? await blendWithFal(prompt, compositeImage, mask)
        : await blendWithOpenAI(prompt, compositeImage, mask);
      return reply.send({ imageUrl: result, prompt });
    } catch (error: any) {
      return reply.code(502).send({ error: error.message });
    }
  });
}
