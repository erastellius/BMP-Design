import { useMemo } from "react";
import { Download, RotateCcw, Save, ShoppingCart } from "lucide-react";
import { useCanvasStore } from "../store/useCanvasStore";
import { downloadPdfQuote } from "../utils/pdfQuote";

export default function RightBomInspector({ onAuth, onSave }: { onAuth: () => void; onSave: () => void }) {
  const parts = useCanvasStore(state => state.parts);
  const selectedId = useCanvasStore(state => state.selectedId);
  const updatePart = useCanvasStore(state => state.updatePart);
  const removePart = useCanvasStore(state => state.removePart);
  const backgroundUrl = useCanvasStore(state => state.backgroundUrl);
  const aiBlendedUrl = useCanvasStore(state => state.aiBlendedUrl);
  const selected = parts.find(part => part.id === selectedId);

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
            <div className="flex gap-2">
              <button onClick={() => updatePart(selected.id, { rotation: 0, skewX: 0, skewY: 0 })} className="flex-1 rounded-md border border-white/10 py-1.5 flex justify-center items-center gap-1"><RotateCcw size={14} /> Reset</button>
              <button onClick={() => removePart(selected.id)} className="flex-1 rounded-md border border-red-400/30 text-red-300 py-1.5">Delete</button>
            </div>
          </div>
        ) : <p className="mt-3 text-sm text-white/40">Select a placed component</p>}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
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
        <button onClick={() => {
          if (!useCanvasStore.getState().user) onAuth();
          else onSave();
        }} className="flex items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-xs"><Save size={14} /> Save</button>
        <button onClick={() => alert("Your custom pergola kit has been added to the sales queue.")} className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-amber-500 text-black font-semibold py-2.5"><ShoppingCart size={16} /> Order Custom Kit</button>
      </div>
    </aside>
  );
}
