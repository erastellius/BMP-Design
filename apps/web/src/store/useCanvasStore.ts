import { create } from "zustand";
import { temporal } from "zundo";
import { pergolaCatalog, type AngleVariant, type CatalogPart } from "../data/pergolaCatalog";

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

export type AiReport = {
  modelUsed: string;
  timestamp: string;
  sunDirection: string;
  shadowAngleDeg: number;
  shadowBlur: number;
  shadowOpacity: number;
  ambientTemp: string;
  ambientTintHex: string;
  perspectiveMatch: string;
  appliedAdjustments: string[];
  fullReasoning: string;
};

export type AiModelOption = {
  id: string;
  name: string;
  provider: "ollama" | "cloud";
  parameterSize?: string;
  fileSize?: number;
  configured: boolean;
};

const DEFAULT_AI_MODEL = "ollama:qwen3.5:4b-mlx";
const CUSTOM_CATALOG_STORAGE_KEY = "bmp-design-custom-catalog-parts";

function isCustomCatalogPart(value: unknown): value is CatalogPart {
  if (!value || typeof value !== "object") return false;
  const part = value as Partial<CatalogPart>;
  return part.category === "Custom" &&
    typeof part.id === "string" &&
    typeof part.sku === "string" &&
    typeof part.name === "string" &&
    Number.isFinite(part.widthInches) &&
    Number.isFinite(part.heightInches) &&
    Number.isFinite(part.unitPrice) &&
    !!part.sprites &&
    typeof part.sprites.front === "string" &&
    typeof part.sprites["iso-left"] === "string" &&
    typeof part.sprites["iso-right"] === "string";
}

function readCustomCatalogParts(): CatalogPart[] {
  if (typeof window === "undefined") return [];

  let serialized: string | null;
  try {
    serialized = window.localStorage.getItem(CUSTOM_CATALOG_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read custom catalog parts from localStorage", error);
    return [];
  }
  if (!serialized) return [];

  try {
    const stored: unknown = JSON.parse(serialized);
    if (!Array.isArray(stored)) throw new Error("Stored custom catalog parts are not an array");
    const parts = stored.filter(isCustomCatalogPart);
    if (parts.length !== stored.length) {
      console.warn("Some invalid custom catalog parts were ignored");
    }
    return parts;
  } catch (error) {
    console.warn("Unable to parse custom catalog parts from localStorage", error);
    return [];
  }
}

function persistCustomCatalogParts(parts: CatalogPart[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CUSTOM_CATALOG_STORAGE_KEY,
    JSON.stringify(parts.filter((part) => part.category === "Custom"))
  );
}

export type PlacedPart = {
  id: string;
  sku: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  skewX: number;
  skewY: number;
  angleVariant: AngleVariant;
  unitPrice: number;
};

export type CurrentUser = { id: number; email: string; role: "customer" | "sales_rep" | "admin" };

export type ActiveProject = { id: number; name: string };

export type SavedCanvasState = {
  backgroundUrl: string;
  aiBlendedUrl: string;
  pixelsPerInch: number;
  parts: PlacedPart[];
  selectedModel?: string;
  lightingParams?: LightingParams | null;
};

export type CanvasState = {
  backgroundUrl: string;
  aiBlendedUrl: string;
  pixelsPerInch: number;
  parts: PlacedPart[];
  catalogParts: CatalogPart[];
  selectedModel: string;
  availableModels: AiModelOption[];
  lightingParams: LightingParams | null;
  lastAiReport: AiReport | null;
  currentUser: CurrentUser | null;
  activeProject: ActiveProject | null;
  selectedId: string | null;
  splitPosition: number;
  setBackgroundUrl: (url: string) => void;
  setAiBlendedUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setAvailableModels: (models: AiModelOption[]) => void;
  setLightingParams: (params: LightingParams | null) => void;
  setLastAiReport: (report: AiReport | null) => void;
  setCurrentUser: (user: CurrentUser | null) => void;
  setActiveProject: (project: ActiveProject | null) => void;
  loadProjectState: (canvasState: SavedCanvasState) => void;
  setPixelsPerInch: (value: number) => void;
  applyCalibration: (pixelDistance: number, realWorldInches: number) => boolean;
  addPart: (part: PlacedPart) => void;
  addCatalogPart: (part: CatalogPart) => void;
  removeCatalogPart: (id: string) => void;
  addCatalogPartToCanvas: (partId: string, centerX: number, centerY: number, angle?: AngleVariant) => void;
  updatePart: (id: string, patch: Partial<PlacedPart>) => void;
  removePart: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setSplitPosition: (value: number) => void;
};

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      backgroundUrl: "",
      aiBlendedUrl: "",
      pixelsPerInch: 10,
      parts: [],
      catalogParts: [...pergolaCatalog, ...readCustomCatalogParts()],
      selectedModel: DEFAULT_AI_MODEL,
      availableModels: [],
      lightingParams: null,
      lastAiReport: null,
      currentUser: null,
      activeProject: null,
      selectedId: null,
      splitPosition: 50,
      setBackgroundUrl: (backgroundUrl) => set({ backgroundUrl }),
      setAiBlendedUrl: (aiBlendedUrl) => set({ aiBlendedUrl }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setAvailableModels: (availableModels) => set((state) => ({
        availableModels,
        selectedModel: state.selectedModel === DEFAULT_AI_MODEL &&
          !availableModels.some((model) => model.id === state.selectedModel)
          ? availableModels.find((model) => model.provider === "ollama")?.id || state.selectedModel
          : state.selectedModel
      })),
      setLightingParams: (lightingParams) => set({ lightingParams }),
      setLastAiReport: (lastAiReport) => set({ lastAiReport }),
      setCurrentUser: (currentUser) => set({ currentUser }),
      setActiveProject: (activeProject) => set({ activeProject }),
      loadProjectState: (canvasState) => set({
        backgroundUrl: canvasState.backgroundUrl,
        aiBlendedUrl: canvasState.aiBlendedUrl,
        pixelsPerInch: canvasState.pixelsPerInch,
        parts: canvasState.parts,
        selectedModel: canvasState.selectedModel || DEFAULT_AI_MODEL,
        lightingParams: canvasState.lightingParams || null,
        selectedId: null,
        splitPosition: 50
      }),
      setPixelsPerInch: (pixelsPerInch) => set({ pixelsPerInch }),
      applyCalibration: (pixelDistance, realWorldInches) => {
        if (!Number.isFinite(pixelDistance) || pixelDistance <= 0 ||
            !Number.isFinite(realWorldInches) || realWorldInches <= 0) return false;
        const pixelsPerInch = pixelDistance / realWorldInches;
        if (!Number.isFinite(pixelsPerInch) || pixelsPerInch <= 0) return false;

        set((state) => {
          const scaleFactor = Number.isFinite(state.pixelsPerInch) && state.pixelsPerInch > 0
            ? pixelsPerInch / state.pixelsPerInch
            : 1;
          return {
            pixelsPerInch,
            parts: state.parts.map((part) => ({
              ...part,
              width: part.width * scaleFactor,
              height: part.height * scaleFactor
            }))
          };
        });
        return true;
      },
      addPart: (part) => set((state) => ({ parts: [...state.parts, part], selectedId: part.id })),
      addCatalogPart: (part) => {
        const catalogParts = [...get().catalogParts, part];
        persistCustomCatalogParts(catalogParts);
        set({ catalogParts });
      },
      removeCatalogPart: (id) => {
        const catalogParts = get().catalogParts;
        if (!catalogParts.some((part) => part.id === id && part.category === "Custom")) return;
        const updatedCatalogParts = catalogParts.filter((part) => part.id !== id);
        persistCustomCatalogParts(updatedCatalogParts);
        set({ catalogParts: updatedCatalogParts });
      },
      addCatalogPartToCanvas: (partId, centerX, centerY, angle = "front") => set((state) => {
        const catalogPart = state.catalogParts.find((part) => part.id === partId);
        if (!catalogPart) return state;

        const width = catalogPart.widthInches * state.pixelsPerInch;
        const height = catalogPart.heightInches * state.pixelsPerInch;
        const placedPart: PlacedPart = {
          id: crypto.randomUUID(),
          sku: catalogPart.sku,
          name: catalogPart.name,
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          angleVariant: angle,
          unitPrice: catalogPart.unitPrice
        };
        return { parts: [...state.parts, placedPart], selectedId: placedPart.id };
      }),
      updatePart: (id, patch) => set((state) => ({
        parts: state.parts.map((part) => part.id === id ? { ...part, ...patch } : part)
      })),
      removePart: (id) => set((state) => ({
        parts: state.parts.filter((part) => part.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
      })),
      setSelectedId: (selectedId) => set({ selectedId }),
      setSplitPosition: (splitPosition) => set({ splitPosition })
    }),
    { limit: 50 }
  )
);
