import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";

export default function SpriteStudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [width, setWidth] = useState("48");
  const [height, setHeight] = useState("96");

  if (!open) return null;
  const readFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="panel w-full max-w-lg rounded-2xl p-5">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">2D Sprite Prep Studio</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div onClick={() => inputRef.current?.click()} className="mt-4 h-56 border border-dashed border-white/20 rounded-xl grid place-items-center cursor-pointer overflow-hidden">
          {preview ? <img src={preview} alt="Sprite preview" className="max-h-full max-w-full" /> : <div className="text-white/50 flex items-center gap-2"><Upload size={18} /> Upload manufactured part PNG</div>}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={event => readFile(event.target.files?.[0])} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <input value={name} onChange={event => setName(event.target.value)} placeholder="Component name" className="col-span-2 rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
          <label className="text-sm text-white/60">Width inches<input value={width} onChange={event => setWidth(event.target.value)} type="number" className="mt-1 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-white" /></label>
          <label className="text-sm text-white/60">Height inches<input value={height} onChange={event => setHeight(event.target.value)} type="number" className="mt-1 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-white" /></label>
        </div>
        <button disabled={!preview || !name} onClick={() => {
          const link = document.createElement("a");
          link.href = preview;
          link.download = `${name.trim().replace(/\s+/g, "-").toLowerCase()}-${width}x${height}.png`;
          link.click();
        }} className="mt-4 w-full rounded-lg bg-amber-500 text-black font-semibold py-2 disabled:opacity-40">Prepare & Download Sprite</button>
      </div>
    </div>
  );
}
