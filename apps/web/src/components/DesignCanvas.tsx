import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { Ruler, Undo2, Redo2, Sun, Upload } from "lucide-react";
import { pergolaCatalog, type AngleVariant } from "../data/pergolaCatalog";
import { useCanvasStore } from "../store/useCanvasStore";
import { exportMask } from "../utils/exportMask";

function PartImage({ id, url, x, y, width, height, rotation, skewX, skewY, isSelected, onSelect, onChange }: {
  id: string; url: string; x: number; y: number; width: number; height: number; rotation: number;
  skewX: number; skewY: number; isSelected: boolean;
  onSelect: () => void; onChange: (patch: Record<string, number>) => void;
}) {
  const [image] = useImage(url);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return <>
    <KonvaImage
      ref={shapeRef}
      image={image}
      x={x} y={y} width={width} height={height}
      rotation={rotation} skewX={skewX} skewY={skewY}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={event => onChange({ x: event.target.x(), y: event.target.y() })}
      onTransformEnd={() => {
        const node = shapeRef.current!;
        onChange({ x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY(), rotation: node.rotation(), skewX: node.skewX(), skewY: node.skewY() });
        node.scaleX(1); node.scaleY(1);
      }}
    />
    {isSelected && <Transformer ref={trRef} rotateEnabled keepRatio={false} borderStroke="#F59E0B" anchorStroke="#F59E0B" anchorFill="#181A20" />}
  </>;
}

export default function DesignCanvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const [rulerMode, setRulerMode] = useState(false);
  const [ruler, setRuler] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [blending, setBlending] = useState(false);
  const [backgroundImage] = useImage(useCanvasStore(state => state.backgroundUrl));
  const [blendedImage] = useImage(useCanvasStore(state => state.aiBlendedUrl));
  const parts = useCanvasStore(state => state.parts);
  const selectedId = useCanvasStore(state => state.selectedId);
  const split = useCanvasStore(state => state.splitPosition);
  const setSplit = useCanvasStore(state => state.setSplitPosition);

  useEffect(() => {
    const resize = () => {
      const el = document.getElementById("canvas-shell");
      if (el) setStageSize({ width: el.clientWidth, height: el.clientHeight });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const uploadBackground = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => useCanvasStore.getState().setBackgroundUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const addPart = (partId: string, angle: AngleVariant, x: number, y: number) => {
    const part = pergolaCatalog.find(item => item.id === partId);
    if (!part) return;
    useCanvasStore.getState().addPart({
      id: crypto.randomUUID(),
      sku: part.sku,
      name: part.name,
      x, y,
      width: Math.max(70, part.widthInches * 5),
      height: Math.max(70, part.heightInches * 1.4),
      rotation: 0, skewX: 0, skewY: 0,
      angleVariant: angle,
      unitPrice: part.unitPrice
    });
  };

  const composite = async () => {
    const dataUrl = stageRef.current?.toDataURL({ pixelRatio: 1 });
    if (!dataUrl) throw new Error("Canvas could not be rendered");
    return dataUrl;
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/analyze-perspective`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ compositeImage: await composite() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      alert(`${data.sunAngle}\n${data.shadowSoftness}\n${data.cameraPerspective}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Perspective analysis failed");
    } finally { setAnalyzing(false); }
  };

  const blend = async () => {
    setBlending(true);
    try {
      const compositeImage = await composite();
      const mask = exportMask(stageSize.width, stageSize.height, parts);
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/blend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ compositeImage, mask })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      useCanvasStore.getState().setAiBlendedUrl(data.imageUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : "AI blend failed");
    } finally { setBlending(false); }
  };

  const onRulerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (!rulerMode) return;
    const point = event.target.getStage()?.getPointerPosition();
    if (point) setRuler({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  };
  const onRulerMove = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (!rulerMode || !ruler) return;
    const point = event.target.getStage()?.getPointerPosition();
    if (point) setRuler(current => current ? { ...current, x2: point.x, y2: point.y } : null);
  };
  const finishRuler = () => {
    if (!ruler) return;
    const input = prompt("Enter real-world distance (example: 10ft or 120in)", "10ft");
    if (!input) return;
    const pixelDistance = Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1);
    const feetMatch = input.match(/([\d.]+)\s*ft/i);
    const inchMatch = input.match(/([\d.]+)\s*in/i);
    const inches = feetMatch ? Number(feetMatch[1]) * 12 : inchMatch ? Number(inchMatch[1]) : 0;
    if (inches && pixelDistance) useCanvasStore.getState().setPixelsPerInch(pixelDistance / inches);
  };

  return (
    <main id="canvas-shell" className="canvas-grid relative h-full min-h-0 overflow-hidden">
      <div className="absolute z-20 left-3 top-3 flex gap-2">
        <button onClick={() => fileRef.current?.click()} className="rounded-lg panel px-3 py-2 text-xs flex items-center gap-1"><Upload size={14} /> Upload</button>
        <button onClick={() => setRulerMode(value => !value)} className={`rounded-lg panel px-3 py-2 text-xs flex items-center gap-1 ${rulerMode ? "text-amber-300" : ""}`}><Ruler size={14} /> Calibrate</button>
        <button onClick={analyze} disabled={analyzing} className="rounded-lg panel px-3 py-2 text-xs flex items-center gap-1"><Sun size={14} /> {analyzing ? "Analyzing…" : "Analyze"}</button>
        <button onClick={() => useCanvasStore.temporal.getState().undo()} className="rounded-lg panel px-2 py-2" title="Undo"><Undo2 size={14} /></button>
        <button onClick={() => useCanvasStore.temporal.getState().redo()} className="rounded-lg panel px-2 py-2" title="Redo"><Redo2 size={14} /></button>
        <button onClick={blend} disabled={blending} className="rounded-lg bg-amber-500 text-black px-3 py-2 text-xs font-semibold">{blending ? "Blending…" : "AI Blend"}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => uploadBackground(event.target.files?.[0])} />
      </div>
      {useCanvasStore(state => state.backgroundUrl) && blendedImage && (
        <input type="range" min="0" max="100" value={split} onChange={event => setSplit(Number(event.target.value))} className="absolute z-20 bottom-5 left-1/2 -translate-x-1/2 w-64" />
      )}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onMouseDown={onRulerDown}
        onMouseMove={onRulerMove}
        onMouseUp={finishRuler}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          const rect = stageRef.current?.getContent().getBoundingClientRect();
          const payload = event.dataTransfer.getData("application/x-bmp-part");
          if (payload && rect) {
            const item = JSON.parse(payload) as { id: string; angle: AngleVariant };
            addPart(item.id, item.angle, event.clientX - rect.left - 45, event.clientY - rect.top - 45);
          }
        }}
        onPointerDown={event => {
          if (event.target === event.target.getStage()) useCanvasStore.getState().setSelectedId(null);
        }}
      >
        <Layer>
          {backgroundImage && <KonvaImage image={backgroundImage} width={stageSize.width} height={stageSize.height} />}
          {blendedImage && (
            <KonvaImage
              image={blendedImage}
              width={stageSize.width}
              height={stageSize.height}
              clipFunc={ctx => {
                ctx.rect(split / 100 * stageSize.width, 0, stageSize.width - split / 100 * stageSize.width, stageSize.height);
                ctx.closePath();
              }}
            />
          )}
          {parts.map(part => {
            const catalogPart = pergolaCatalog.find(item => item.sku === part.sku);
            const url = catalogPart?.sprites[part.angleVariant];
            return url ? (
              <PartImage
                key={part.id}
                id={part.id}
                url={url}
                {...part}
                isSelected={selectedId === part.id}
                onSelect={() => useCanvasStore.getState().setSelectedId(part.id)}
                onChange={patch => useCanvasStore.getState().updatePart(part.id, patch)}
              />
            ) : null;
          })}
          {ruler && <Line points={[ruler.x1, ruler.y1, ruler.x2, ruler.y2]} stroke="#F59E0B" strokeWidth={3} dash={[8, 6]} />}
        </Layer>
      </Stage>
    </main>
  );
}
