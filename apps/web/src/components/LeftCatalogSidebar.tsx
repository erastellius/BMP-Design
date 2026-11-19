import { useMemo, useState } from "react";
import { Download, Search, SlidersHorizontal } from "lucide-react";
import { pergolaCatalog, type AngleVariant, type CatalogPart } from "../data/pergolaCatalog";

export default function LeftCatalogSidebar({ onOpenStudio }: { onOpenStudio: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [angle, setAngle] = useState<AngleVariant>("front");

  const parts = useMemo(() => pergolaCatalog.filter(part =>
    (category === "All" || part.category === category) &&
    `${part.name} ${part.sku}`.toLowerCase().includes(query.toLowerCase())
  ), [query, category]);

  const downloadSprite = (part: CatalogPart) => {
    const link = document.createElement("a");
    link.href = part.sprites[angle];
    link.download = `${part.sku}-${angle}.svg`;
    link.click();
  };

  return (
    <aside className="panel h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Parts Catalog</h2>
          <button onClick={onOpenStudio} className="text-xs px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300" title="Admin Sprite Studio">
            <SlidersHorizontal size={15} />
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-lg bg-black/20 border border-white/10 px-3 py-2">
          <Search size={16} className="text-white/50" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search SKU or component" className="w-full bg-transparent outline-none text-sm" />
        </label>
        <select value={category} onChange={event => setCategory(event.target.value)} className="mt-2 w-full rounded-lg bg-[#23262E] border border-white/10 px-3 py-2 text-sm">
          {["All", "Posts", "Brackets", "Beams", "Roof"].map(value => <option key={value}>{value}</option>)}
        </select>
        <select value={angle} onChange={event => setAngle(event.target.value as AngleVariant)} className="mt-2 w-full rounded-lg bg-[#23262E] border border-white/10 px-3 py-2 text-sm">
          <option value="front">Front</option>
          <option value="iso-left">ISO Left</option>
          <option value="iso-right">ISO Right</option>
        </select>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 space-y-3">
        {parts.map(part => (
          <article
            key={part.id}
            draggable
            onDragStart={event => event.dataTransfer.setData("application/x-bmp-part", JSON.stringify({ id: part.id, angle }))}
            className="rounded-xl border border-white/10 bg-black/10 p-3 hover:border-amber-400/40 transition"
          >
            <div className="h-28 rounded-lg bg-[#20232A] grid place-items-center overflow-hidden">
              <img src={part.sprites[angle]} alt="" className="max-h-full max-w-full" />
            </div>
            <h3 className="mt-2 text-sm font-medium">{part.name}</h3>
            <p className="text-xs text-white/50 mt-1">{part.sku} · {part.widthInches}" × {part.heightInches}"</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-amber-300 text-sm">${part.unitPrice}</span>
              <button onClick={() => downloadSprite(part)} className="flex items-center gap-1 text-xs rounded-md border border-white/10 px-2 py-1 hover:bg-white/5">
                <Download size={13} /> Sprite
              </button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
