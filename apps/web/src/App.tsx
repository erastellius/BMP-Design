import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun, UserRound, Shield } from "lucide-react";
import LeftCatalogSidebar from "./components/LeftCatalogSidebar";
import DesignCanvas from "./components/DesignCanvas";
import RightBomInspector from "./components/RightBomInspector";
import SpriteStudioModal from "./components/SpriteStudioModal";
import Auth2FAModal from "./components/Auth2FAModal";
import AdminUsersModal from "./components/AdminUsersModal";
import MyProjectsModal from "./components/MyProjectsModal";
import { useCanvasStore } from "./store/useCanvasStore";
import type { AiModelOption, CurrentUser, SavedCanvasState } from "./store/useCanvasStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

function isCurrentUser(value: unknown): value is CurrentUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<CurrentUser>;
  return Number.isSafeInteger(user.id) &&
    typeof user.email === "string" &&
    (user.role === "customer" || user.role === "sales_rep" || user.role === "admin");
}

function isSavedCanvasState(value: unknown): value is SavedCanvasState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SavedCanvasState>;
  if (typeof state.backgroundUrl !== "string" ||
      typeof state.aiBlendedUrl !== "string" ||
      typeof state.pixelsPerInch !== "number" ||
      !Number.isFinite(state.pixelsPerInch) ||
      state.pixelsPerInch <= 0 ||
      !Array.isArray(state.parts)) return false;
  return state.parts.every(part =>
    !!part &&
    typeof part.id === "string" &&
    typeof part.sku === "string" &&
    typeof part.name === "string" &&
    [part.x, part.y, part.width, part.height, part.rotation, part.skewX, part.skewY, part.unitPrice].every(Number.isFinite) &&
    ["front", "iso-left", "iso-right"].includes(part.angleVariant)
  );
}

export default function App() {
  const [light, setLight] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioToast, setStudioToast] = useState("");
  const [projectToast, setProjectToast] = useState<{ message: string; error: boolean } | null>(null);
  const [drawer, setDrawer] = useState<"catalog" | "inspector" | null>(null);
  const currentUser = useCanvasStore(state => state.currentUser);
  const activeProject = useCanvasStore(state => state.activeProject);
  const setAvailableModels = useCanvasStore(state => state.setAvailableModels);
  const thumbnailCaptures = useRef(new Map<string, () => string | null>());
  const savePendingAuth = useRef(false);
  const projectsPendingAuth = useRef(false);
  const registerCanvasThumbnailCapture = useCallback((key: string, capture: (() => string | null) | null) => {
    if (capture) thumbnailCaptures.current.set(key, capture);
    else thumbnailCaptures.current.delete(key);
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/ai/models`);
      if (!response.ok) throw new Error(`AI model discovery failed: ${response.status}`);
      const data = await response.json() as { models?: AiModelOption[]; ollamaOnline?: boolean };
      if (!Array.isArray(data.models) || typeof data.ollamaOnline !== "boolean") {
        throw new Error("AI model discovery returned an invalid response");
      }
      setAvailableModels(data.models);
    } catch (error) {
      console.error("Unable to load available AI models", error);
    }
  }, [setAvailableModels]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/auth/me`, { credentials: "include" })
      .then(async response => {
        if (response.status === 401) return null;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Session check failed: ${response.status}`);
        if (!isCurrentUser(data.user)) throw new Error("Session response did not contain a valid user");
        return data.user;
      })
      .then(user => {
        if (active && user) useCanvasStore.getState().setCurrentUser(user);
      })
      .catch(error => {
        if (active) console.error("Unable to restore the current session", error);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!studioToast) return;
    const timeout = window.setTimeout(() => setStudioToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [studioToast]);

  useEffect(() => {
    if (!projectToast) return;
    const timeout = window.setTimeout(() => setProjectToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [projectToast]);

  const toggleTheme = () => {
    setLight(value => {
      document.documentElement.classList.toggle("light", !value);
      return !value;
    });
  };

  const saveProject = useCallback(async () => {
    const state = useCanvasStore.getState();
    if (!state.currentUser) {
      savePendingAuth.current = true;
      setAuthOpen(true);
      return;
    }

    const initialName = state.activeProject?.name || "Main Backyard Pergola - 35ft";
    const enteredName = window.prompt("Project Name:", initialName);
    if (!enteredName?.trim()) return;
    const name = enteredName.trim();
    const updateCurrent = state.activeProject
      ? window.confirm(`Update "${state.activeProject.name}"? Choose Cancel to save this as a new project.`)
      : false;

    try {
      const thumbnailDataUrl = [...thumbnailCaptures.current.values()]
        .map(capture => capture())
        .find((thumbnail): thumbnail is string => !!thumbnail);
      if (!thumbnailDataUrl) throw new Error("Could not capture a canvas thumbnail");
      const response = await fetch(`${API}/api/projects`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(updateCurrent && state.activeProject ? { id: state.activeProject.id } : {}),
          name,
          thumbnailDataUrl,
          canvasState: {
            backgroundUrl: state.backgroundUrl,
            aiBlendedUrl: state.aiBlendedUrl,
            pixelsPerInch: state.pixelsPerInch,
            parts: state.parts,
            selectedModel: state.selectedModel,
            lightingParams: state.lightingParams
          },
          bomItems: state.parts,
          totalUsd: state.parts.reduce((sum, part) => sum + part.unitPrice, 0)
        })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          savePendingAuth.current = true;
          useCanvasStore.getState().setCurrentUser(null);
          setAuthOpen(true);
          return;
        }
        throw new Error(data.error || "Could not save project");
      }
      if (!Number.isSafeInteger(data.id)) throw new Error("Save response did not contain a project id");
      useCanvasStore.getState().setActiveProject({ id: data.id, name });
      setProjectToast({ message: "Project saved to your account ✓", error: false });
    } catch (error) {
      setProjectToast({ message: error instanceof Error ? error.message : "Could not save project", error: true });
    }
  }, []);

  const loadProject = useCallback(async (id: number) => {
    const response = await fetch(`${API}/api/projects/${id}`, { credentials: "include" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load project");
    if (!Number.isSafeInteger(data.id) || typeof data.name !== "string" || !isSavedCanvasState(data.canvasState)) {
      throw new Error("Saved project data is invalid");
    }
    useCanvasStore.getState().loadProjectState(data.canvasState);
    useCanvasStore.getState().setActiveProject({ id: data.id, name: data.name });
    setProjectToast({ message: `Loaded "${data.name}"`, error: false });
  }, []);

  const handleAuthenticated = useCallback(() => {
    if (savePendingAuth.current) {
      savePendingAuth.current = false;
      window.setTimeout(() => { void saveProject(); }, 0);
    }
    if (projectsPendingAuth.current) {
      projectsPendingAuth.current = false;
      setProjectsOpen(true);
    }
  }, [saveProject]);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    if (!useCanvasStore.getState().currentUser) {
      savePendingAuth.current = false;
      projectsPendingAuth.current = false;
    }
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0F1115] text-[#F7F8FA] light:bg-[#F4F5F7] light:text-[#17191E]">
      <header className="h-14 px-3 md:px-5 flex items-center justify-between border-b border-white/10 panel">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500 text-black grid place-items-center font-black">B</div>
          <div>
            <h1 className="text-sm font-semibold leading-none">BMP-Design</h1>
            <p className="mt-1 text-[10px] text-white/40">Pergola Configurator Pro</p>
            {activeProject && <p className="max-w-48 truncate text-[10px] text-amber-300" title={activeProject.name}>{activeProject.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUser?.role === "admin" && <button onClick={() => setAdminOpen(true)} className="rounded-lg border border-white/10 p-2" title="Admin users"><Shield size={16} /></button>}
          <button onClick={toggleTheme} className="rounded-lg border border-white/10 p-2" title="Toggle theme">{light ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button
            onClick={() => {
              if (currentUser) setProjectsOpen(true);
              else {
                projectsPendingAuth.current = true;
                setAuthOpen(true);
              }
            }}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs"
          >
            My Projects
          </button>
          <button onClick={() => setAuthOpen(true)} className="rounded-lg border border-white/10 px-3 py-2 flex items-center gap-2 text-xs"><UserRound size={15} /> {currentUser?.email || "Account"}</button>
        </div>
      </header>
      <div className="hidden md:grid h-[calc(100vh-56px)] grid-cols-[260px_minmax(420px,1fr)_280px] gap-2 p-2">
        <LeftCatalogSidebar onOpenStudio={() => setStudioOpen(true)} />
        <DesignCanvas thumbnailCaptureKey="desktop" onRegisterThumbnailCapture={registerCanvasThumbnailCapture} onRefreshModels={() => void refreshModels()} />
        <RightBomInspector onSave={() => void saveProject()} />
      </div>
      <div className="md:hidden h-[calc(100vh-56px)] relative">
        <DesignCanvas thumbnailCaptureKey="mobile" onRegisterThumbnailCapture={registerCanvasThumbnailCapture} onRefreshModels={() => void refreshModels()} />
        <div className="absolute z-30 bottom-3 left-1/2 -translate-x-1/2 panel rounded-full p-1 flex gap-1">
          <button onClick={() => setDrawer("catalog")} className="px-4 py-2 text-xs rounded-full">Parts</button>
          <button onClick={() => setDrawer("inspector")} className="px-4 py-2 text-xs rounded-full">BOM</button>
        </div>
        {drawer && (
          <div className="absolute z-40 inset-x-0 bottom-0 h-[70%] rounded-t-2xl overflow-hidden panel" onTouchStart={() => undefined}>
            <div className="h-1 w-12 rounded-full bg-white/20 mx-auto mt-2" />
            {drawer === "catalog" ? <LeftCatalogSidebar onOpenStudio={() => setStudioOpen(true)} /> : <RightBomInspector onSave={() => void saveProject()} />}
          </div>
        )}
      </div>

      <SpriteStudioModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onSuccess={() => setStudioToast("Transparent sprite added to Parts Catalog and downloaded")}
      />
      {studioToast && <div role="status" className="fixed z-[60] bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{studioToast}</div>}
      {projectToast && <div role={projectToast.error ? "alert" : "status"} className={`fixed z-[60] bottom-5 left-1/2 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${projectToast.error ? "bg-red-700" : "bg-emerald-600"}`}>{projectToast.message}</div>}
      <Auth2FAModal open={authOpen} onClose={closeAuth} onAuthenticated={handleAuthenticated} />
      <AdminUsersModal open={adminOpen} onClose={() => setAdminOpen(false)} />
      <MyProjectsModal
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        onLoadProject={loadProject}
        onDeleted={id => {
          if (useCanvasStore.getState().activeProject?.id === id) useCanvasStore.getState().setActiveProject(null);
        }}
      />
    </div>
  );
}
