import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, RotateCcw, Save, ShoppingCart } from "lucide-react";
import { useCanvasStore } from "../store/useCanvasStore";
import { downloadPdfQuote } from "../utils/pdfQuote";

export default function RightBomInspector({ onSave }: { onSave: () => void }) {
  const [reportExpanded, setReportExpanded] = useState(true);
  const parts = useCanvasStore(state => state.parts);
  const catalogParts = useCanvasStore(state => state.catalogParts);
  const selectedId = useCanvasStore(state => state.selectedId);
  const updatePart = useCanvasStore(state => state.updatePart);
  const removePart = useCanvasStore(state => state.removePart);
  const backgroundUrl = useCanvasStore(state => state.backgroundUrl);
  const aiBlendedUrl = useCanvasStore(state => state.aiBlendedUrl);
  const lastAiReport = useCanvasStore(state => state.lastAiReport);
  const selected = parts.find(part => part.id === selectedId);
  const postParts = parts.filter(part => {
    const catalogPart = catalogParts.find(item => item.sku === part.sku);
    return catalogPart?.category === "Posts" && catalogPart.widthInches === 8;
  });

  const alignSelected = (direction: "left" | "right") => {
    if (!selected) return;
    const horizontalSkew = Math.tan(15 * Math.PI / 180) * (direction === "left" ? -1 : 1);
    const verticalSkew = Math.tan(3 * Math.PI / 180) * (direction === "left" ? 1 : -1);
    updatePart(selected.id, { rotation: 0, skewX: horizontalSkew, skewY: verticalSkew });
  };

  const bom = useMemo(() => {
    const rows = new Map<string, { sku: string; name: string; qty: number; unitPrice: number }>();
    for (const part of parts) {
      const row = rows.get(part.sku) || { sku: part.sku, name: part.name, qty: 0, unitPrice: part.unitPrice };
      row.qty++;
      rows.set(part.sku, row);
    }
    return [...rows.values()];
  }, [parts]);
  const total = bom.reduce((sum, row) => sum + row.qty * row.unitPrice, 0);

  return (
    <aside className="panel h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h2 className="font-semibold">Inspector</h2>
        {selected ? (
          <div className="mt-3 space-y-3 text-sm">
            <label className="block text-white/60">Rotation <input type="range" min="-180" max="180" value={selected.rotation} onChange={e => updatePart(selected.id, { rotation: Number(e.target.value) })} className="w-full" /></label>
            <label className="block text-white/60">Skew X <input type="range" min="-45" max="45" value={selected.skewX} onChange={e => updatePart(selected.id, { skewX: Number(e.target.value) })} className="w-full" /></label>
            <label className="block text-white/60">Skew Y <input type="range" min="-45" max="45" value={selected.skewY} onChange={e => updatePart(selected.id, { skewY: Number(e.target.value) })} className="w-full" /></label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => alignSelected("left")} className="rounded-md border border-white/10 py-1.5 text-xs">Align to House Left</button>
              <button onClick={() => alignSelected("right")} className="rounded-md border border-white/10 py-1.5 text-xs">Align to House Right</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => updatePart(selected.id, { rotation: 0, skewX: 0, skewY: 0 })} className="flex-1 rounded-md border border-white/10 py-1.5 flex justify-center items-center gap-1"><RotateCcw size={14} /> Reset</button>
              <button onClick={() => removePart(selected.id)} className="flex-1 rounded-md border border-red-400/30 text-red-300 py-1.5">Delete</button>
            </div>
          </div>
        ) : <p className="mt-3 text-sm text-white/40">Select a placed component</p>}
        <button
          type="button"
          disabled={postParts.length === 0}
          onClick={() => postParts.forEach(part => updatePart(part.id, { rotation: 0, skewX: 0, skewY: 0 }))}
          className="mt-3 w-full rounded-md border border-white/10 py-1.5 text-xs disabled:opacity-40"
        >
          Vertical Posts
        </button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {lastAiReport && (
          <section className="mb-5 overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/5">
            <button
              type="button"
              onClick={() => setReportExpanded(value => !value)}
              aria-expanded={reportExpanded}
              className="flex w-full items-center justify-between gap-2 p-3 text-left"
            >
              <span className="text-sm font-semibold">AI Blend &amp; Lighting Report</span>
              {reportExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {reportExpanded && (
              <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2 text-xs text-white/75">
                <p className="text-[10px] text-white/45">
                  {lastAiReport.modelUsed} · {new Date(lastAiReport.timestamp).toLocaleString()}
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li><b>Sun Direction:</b> {lastAiReport.sunDirection}</li>
                  <li><b>Shadow Angle &amp; Blur:</b> {lastAiReport.shadowAngleDeg}° · {lastAiReport.shadowBlur}px · {Math.round(lastAiReport.shadowOpacity * 100)}% opacity</li>
                  <li><b>Sunlight Color Tint:</b> {lastAiReport.ambientTemp} ({lastAiReport.ambientTintHex})</li>
                  <li><b>Perspective Adjustment:</b> {lastAiReport.perspectiveMatch}</li>
                  <li>
                    <b>Applied Adjustments:</b>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-white/60">
                      {lastAiReport.appliedAdjustments.map((adjustment, index) => <li key={`${index}-${adjustment}`}>{adjustment}</li>)}
                    </ul>
                  </li>
                  <li><b>Full LLM Scene Prompt / Reasoning:</b> <span className="whitespace-pre-wrap">{lastAiReport.fullReasoning}</span></li>
                </ul>
              </div>
            )}
          </section>
        )}
        <h3 className="text-sm font-semibold">Manufacturing Cost Estimate</h3>
        <div className="mt-3 space-y-2">
          {bom.map(row => (
            <div key={row.sku} className="rounded-lg bg-black/10 border border-white/10 p-3">
              <div className="flex justify-between gap-2 text-xs"><span>{row.name}</span><span className="text-white/50">×{row.qty}</span></div>
              <div className="mt-1 flex justify-between text-sm"><span className="text-white/40">{row.sku}</span><b>${(row.qty * row.unitPrice).toFixed(2)}</b></div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-white/10 pt-4 flex justify-between text-lg"><span>Total</span><b className="text-amber-300">${total.toFixed(2)}</b></div>
      </div>
      <div className="p-4 border-t border-white/10 grid grid-cols-2 gap-2">
        <button onClick={() => downloadPdfQuote(aiBlendedUrl || backgroundUrl, parts)} className="flex items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-xs"><Download size={14} /> PDF Quote</button>
        <button onClick={onSave} className="flex items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-xs"><Save size={14} /> Save</button>
        <button onClick={() => alert("Your custom pergola kit has been added to the sales queue.")} className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-amber-500 text-black font-semibold py-2.5"><ShoppingCart size={16} /> Order Custom Kit</button>
      </div>
    </aside>
  );
}
