import { useEffect, useState } from "react";
import { Moon, Sun, UserRound, Shield } from "lucide-react";
import LeftCatalogSidebar from "./components/LeftCatalogSidebar";
import DesignCanvas from "./components/DesignCanvas";
import RightBomInspector from "./components/RightBomInspector";
import SpriteStudioModal from "./components/SpriteStudioModal";
import Auth2FAModal from "./components/Auth2FAModal";
import AdminUsersModal from "./components/AdminUsersModal";
import { useCanvasStore } from "./store/useCanvasStore";

export default function App() {
  const [light, setLight] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioToast, setStudioToast] = useState("");
  const [drawer, setDrawer] = useState<"catalog" | "inspector" | null>(null);
  const user = useCanvasStore(state => state.user);

  useEffect(() => {
    if (!studioToast) return;
    const timeout = window.setTimeout(() => setStudioToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [studioToast]);

  const toggleTheme = () => {
    setLight(value => {
      document.documentElement.classList.toggle("light", !value);
      return !value;
    });
  };

  const saveProject = async () => {
    const state = useCanvasStore.getState();
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/projects`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Pergola design ${new Date().toLocaleDateString()}`,
          canvasJson: { backgroundUrl: state.backgroundUrl, aiBlendedUrl: state.aiBlendedUrl, pixelsPerInch: state.pixelsPerInch, parts: state.parts },
          bomJson: state.parts,
          totalUsd: state.parts.reduce((sum, part) => sum + part.unitPrice, 0)
        })
      });
      if (!response.ok) throw new Error((await response.json()).error || "Save failed");
      alert("Cloud project saved");
    } catch (error) { alert(error instanceof Error ? error.message : "Save failed"); }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0F1115] text-[#F7F8FA] light:bg-[#F4F5F7] light:text-[#17191E]">
      <header className="h-14 px-3 md:px-5 flex items-center justify-between border-b border-white/10 panel">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500 text-black grid place-items-center font-black">B</div>
          <div><h1 className="text-sm font-semibold leading-none">BMP-Design</h1><p className="mt-1 text-[10px] text-white/40">Pergola Configurator Pro</p></div>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && <button onClick={() => setAdminOpen(true)} className="rounded-lg border border-white/10 p-2" title="Admin users"><Shield size={16} /></button>}
          <button onClick={toggleTheme} className="rounded-lg border border-white/10 p-2" title="Toggle theme">{light ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button onClick={() => setAuthOpen(true)} className="rounded-lg border border-white/10 px-3 py-2 flex items-center gap-2 text-xs"><UserRound size={15} /> {user?.email || "Account"}</button>
        </div>
      </header>
      <div className="hidden md:grid h-[calc(100vh-56px)] grid-cols-[260px_minmax(420px,1fr)_280px] gap-2 p-2">
        <LeftCatalogSidebar onOpenStudio={() => setStudioOpen(true)} />
        <DesignCanvas />
        <RightBomInspector onAuth={() => setAuthOpen(true)} onSave={saveProject} />
      </div>
      <div className="md:hidden h-[calc(100vh-56px)] relative">
        <DesignCanvas />
        <div className="absolute z-30 bottom-3 left-1/2 -translate-x-1/2 panel rounded-full p-1 flex gap-1">
          <button onClick={() => setDrawer("catalog")} className="px-4 py-2 text-xs rounded-full">Parts</button>
          <button onClick={() => setDrawer("inspector")} className="px-4 py-2 text-xs rounded-full">BOM</button>
        </div>
        {drawer && (
          <div className="absolute z-40 inset-x-0 bottom-0 h-[70%] rounded-t-2xl overflow-hidden panel" onTouchStart={() => undefined}>
            <div className="h-1 w-12 rounded-full bg-white/20 mx-auto mt-2" />
            {drawer === "catalog" ? <LeftCatalogSidebar onOpenStudio={() => setStudioOpen(true)} /> : <RightBomInspector onAuth={() => setAuthOpen(true)} onSave={saveProject} />}
          </div>
        )}
      </div>

      <SpriteStudioModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onSuccess={() => setStudioToast("Transparent sprite added to Parts Catalog and downloaded")}
      />
      {studioToast && <div role="status" className="fixed z-[60] bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{studioToast}</div>}
      <Auth2FAModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <AdminUsersModal open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}
