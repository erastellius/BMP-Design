import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import type { AngleVariant } from "../data/pergolaCatalog";
import { useCanvasStore } from "../store/useCanvasStore";

function prepareTransparentPng(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("Could not create an offscreen canvas"));
        return;
      }

      context.drawImage(image, 0, 0);
      let pixels: ImageData;
      try {
        pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      } catch (error) {
        reject(new Error(`Could not read the uploaded image: ${error instanceof Error ? error.message : "unknown canvas error"}`));
        return;
      }

      let left = canvas.width;
      let top = canvas.height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          if (pixels.data[index] > 240 && pixels.data[index + 1] > 240 && pixels.data[index + 2] > 240) {
            pixels.data[index + 3] = 0;
          }
          if (pixels.data[index + 3] > 0) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) {
        reject(new Error("The uploaded image has no visible pixels after removing its white background"));
        return;
      }

      context.putImageData(pixels, 0, 0);
      const cropped = document.createElement("canvas");
      cropped.width = right - left + 1;
      cropped.height = bottom - top + 1;
      const croppedContext = cropped.getContext("2d");
      if (!croppedContext) {
        reject(new Error("Could not create a canvas for the cropped sprite"));
        return;
      }
      croppedContext.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
      try {
        resolve(cropped.toDataURL("image/png"));
      } catch (error) {
        reject(new Error(`Could not export the transparent PNG: ${error instanceof Error ? error.message : "unknown canvas error"}`));
      }
    };
    image.onerror = () => reject(new Error("Could not load the uploaded image"));
    image.src = source;
  });
}

export default function SpriteStudioModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [width, setWidth] = useState("48");
  const [height, setHeight] = useState("96");
  const [price, setPrice] = useState("0.00");
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);

  if (!open) return null;
  const readFile = (file?: File) => {
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.onerror = () => setError("Could not read the selected image");
    reader.readAsDataURL(file);
  };

  const prepareAndDownload = async () => {
    const trimmedName = name.trim();
    const widthInches = Number(width);
    const heightInches = Number(height);
    const unitPrice = Number(price);
    if (!trimmedName || !preview) {
      setError("Upload an image and enter a component name");
      return;
    }
    if (!Number.isFinite(widthInches) || widthInches <= 0 || !Number.isFinite(heightInches) || heightInches <= 0) {
      setError("Width and height must be positive numbers");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Price must be a non-negative number");
      return;
    }

    setPreparing(true);
    setError("");
    try {
      const transparentPng = await prepareTransparentPng(preview);
      const sku = `BMP-CUSTOM-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const catalogPart = {
        id: crypto.randomUUID(),
        sku,
        name: trimmedName,
        category: "Custom" as const,
        widthInches,
        heightInches,
        unitPrice,
        sprites: {
          front: transparentPng,
          "iso-left": transparentPng,
          "iso-right": transparentPng
        } satisfies Record<AngleVariant, string>
      };
      useCanvasStore.getState().addCatalogPart(catalogPart);

      const link = document.createElement("a");
      const filename = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sprite";
      link.href = transparentPng;
      link.download = `${filename}-${widthInches}x${heightInches}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setPreview("");
      setName("");
      setWidth("48");
      setHeight("96");
      setPrice("0.00");
      onClose();
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare the sprite");
    } finally {
      setPreparing(false);
    }
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
          <label className="text-sm text-white/60">Width inches<input value={width} onChange={event => setWidth(event.target.value)} type="number" min="0.01" step="any" className="mt-1 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-white" /></label>
          <label className="text-sm text-white/60">Height inches<input value={height} onChange={event => setHeight(event.target.value)} type="number" min="0.01" step="any" className="mt-1 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-white" /></label>
          <label className="col-span-2 text-sm text-white/60">Default price (USD)<input value={price} onChange={event => setPrice(event.target.value)} type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-white" /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <button disabled={!preview || !name.trim() || preparing} onClick={prepareAndDownload} className="mt-4 w-full rounded-lg bg-amber-500 text-black font-semibold py-2 disabled:opacity-40">
          {preparing ? "Preparing…" : "Prepare & Download Sprite"}
        </button>
      </div>
    </div>
  );
}
