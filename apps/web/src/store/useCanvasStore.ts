import { create } from "zustand";
import { temporal } from "zundo";
import type { AngleVariant } from "../data/pergolaCatalog";

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

type UserState = { id: number; email: string; role: "customer" | "sales_rep" | "admin" } | null;

export type CanvasState = {
  backgroundUrl: string;
  aiBlendedUrl: string;
  pixelsPerInch: number;
  parts: PlacedPart[];
  selectedId: string | null;
  user: UserState;
  splitPosition: number;
  setBackgroundUrl: (url: string) => void;
  setAiBlendedUrl: (url: string) => void;
  setPixelsPerInch: (value: number) => void;
  addPart: (part: PlacedPart) => void;
  updatePart: (id: string, patch: Partial<PlacedPart>) => void;
  removePart: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setUser: (user: UserState) => void;
  setSplitPosition: (value: number) => void;
};

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set) => ({
      backgroundUrl: "",
      aiBlendedUrl: "",
      pixelsPerInch: 10,
      parts: [],
      selectedId: null,
      user: null,
      splitPosition: 50,
      setBackgroundUrl: (backgroundUrl) => set({ backgroundUrl }),
      setAiBlendedUrl: (aiBlendedUrl) => set({ aiBlendedUrl }),
      setPixelsPerInch: (pixelsPerInch) => set({ pixelsPerInch }),
      addPart: (part) => set((state) => ({ parts: [...state.parts, part], selectedId: part.id })),
      updatePart: (id, patch) => set((state) => ({
        parts: state.parts.map((part) => part.id === id ? { ...part, ...patch } : part)
      })),
      removePart: (id) => set((state) => ({
        parts: state.parts.filter((part) => part.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
      })),
      setSelectedId: (selectedId) => set({ selectedId }),
      setUser: (user) => set({ user }),
      setSplitPosition: (splitPosition) => set({ splitPosition })
    }),
    { limit: 50 }
  )
);
