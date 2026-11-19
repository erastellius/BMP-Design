import { useEffect, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { Ruler, Undo2, Redo2, Sun, Upload } from "lucide-react";
import type { AngleVariant } from "../data/pergolaCatalog";
import { useCanvasStore } from "../store/useCanvasStore";
import { exportMask } from "../utils/exportMask";

function PartImage({ id, url, x, y, width, height, rotation, skewX, skewY, isSelected, calibrationMode, onSelect, onChange }: {
  id: string; url: string; x: number; y: number; width: number; height: number; rotation: number;
  skewX: number; skewY: number; isSelected: boolean; calibrationMode: boolean;
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
      draggable={!calibrationMode}
      onClick={() => { if (!calibrationMode) onSelect(); }}
      onTap={() => { if (!calibrationMode) onSelect(); }}
      onDragEnd={event => onChange({ x: event.target.x(), y: event.target.y() })}
      onTransformEnd={() => {
        const node = shapeRef.current!;
        onChange({ x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY(), rotation: node.rotation(), skewX: node.skewX(), skewY: node.skewY() });
        node.scaleX(1); node.scaleY(1);
      }}
    />
    {isSelected && !calibrationMode && <Transformer ref={trRef} rotateEnabled keepRatio={false} borderStroke="#F59E0B" anchorStroke="#F59E0B" anchorFill="#181A20" />}
  </>;
}

export default function DesignCanvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const calibrationInputRef = useRef<HTMLInputElement>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const [rulerMode, setRulerMode] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [endPoint, setEndPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [calibrationValue, setCalibrationValue] = useState("35");
  const [calibrationUnit, setCalibrationUnit] = useState<"ft" | "in">("ft");
  const [scaleStatus, setScaleStatus] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [blending, setBlending] = useState(false);
  const [backgroundImage] = useImage(useCanvasStore(state => state.backgroundUrl));
  const [blendedImage] = useImage(useCanvasStore(state => state.aiBlendedUrl));
  const parts = useCanvasStore(state => state.parts);
  const catalogParts = useCanvasStore(state => state.catalogParts);
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

  useEffect(() => {
    if (rulerMode && startPoint && endPoint) {
      calibrationInputRef.current?.focus();
      calibrationInputRef.current?.select();
    }
  }, [rulerMode, startPoint, endPoint]);

  const cancelCalibration = () => {
    setRulerMode(false);
    setStartPoint(null);
    setEndPoint(null);
    setCurrentPoint(null);
  };

  const toggleCalibration = () => {
    if (rulerMode) {
      cancelCalibration();
      return;
    }
    setStartPoint(null);
    setEndPoint(null);
    setCurrentPoint(null);
    setCalibrationValue("35");
    setCalibrationUnit("ft");
    setRulerMode(true);
  };

  const onCalibrationPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerMode || !stageRef.current?.getContent().contains(event.target as Node)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!startPoint) {
      setStartPoint(point);
      setCurrentPoint(point);
    } else if (!endPoint) {
      setCurrentPoint(point);
      setEndPoint(point);
    }
  };

  const onCalibrationPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerMode || !startPoint || endPoint || !stageRef.current?.getContent().contains(event.target as Node)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCurrentPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const lineEnd = endPoint || currentPoint;
  const pixelDistance = startPoint && lineEnd
    ? Math.hypot(lineEnd.x - startPoint.x, lineEnd.y - startPoint.y)
    : 0;
  const realWorldValue = Number(calibrationValue);
  const realWorldInches = calibrationUnit === "ft" ? realWorldValue * 12 : realWorldValue;

  const applyScale = () => {
    if (!endPoint || !Number.isFinite(realWorldInches) || realWorldInches <= 0 || pixelDistance <= 0) return;
    if (useCanvasStore.getState().applyCalibration(pixelDistance, realWorldInches)) {
      setScaleStatus(`Scale: ${calibrationValue} ${calibrationUnit} calibrated ✓`);
      setRulerMode(false);
      setCurrentPoint(null);
    }
  };

  return (
    <main id="canvas-shell" className="canvas-grid relative h-full min-h-0 overflow-hidden">
      <div className="absolute z-20 left-3 right-3 md:right-auto top-3 flex flex-wrap md:flex-nowrap gap-2">
        <button onClick={() => fileRef.current?.click()} className="rounded-lg panel px-3 py-2 text-xs flex items-center gap-1"><Upload size={14} /> Upload</button>
        <button onClick={toggleCalibration} className={`rounded-lg panel px-3 py-2 text-xs flex items-center gap-1 ${rulerMode ? "text-amber-300" : ""}`}><Ruler size={14} /> {rulerMode ? "Cancel calibration" : "Calibrate"}</button>
        {scaleStatus && <span role="status" className="rounded-lg panel px-2 md:px-3 py-2 text-[10px] md:text-xs text-emerald-300">{scaleStatus}</span>}
        <button onClick={analyze} disabled={analyzing} className="rounded-lg panel px-3 py-2 text-xs flex items-center gap-1"><Sun size={14} /> {analyzing ? "Analyzing…" : "Analyze"}</button>
        <button onClick={() => useCanvasStore.temporal.getState().undo()} className="rounded-lg panel px-2 py-2" title="Undo"><Undo2 size={14} /></button>
        <button onClick={() => useCanvasStore.temporal.getState().redo()} className="rounded-lg panel px-2 py-2" title="Redo"><Redo2 size={14} /></button>
        <button onClick={blend} disabled={blending} className="rounded-lg bg-amber-500 text-black px-3 py-2 text-xs font-semibold">{blending ? "Blending…" : "AI Blend"}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => uploadBackground(event.target.files?.[0])} />
      </div>
      {useCanvasStore(state => state.backgroundUrl) && blendedImage && (
        <input type="range" min="0" max="100" value={split} onChange={event => setSplit(Number(event.target.value))} className="absolute z-20 bottom-5 left-1/2 -translate-x-1/2 w-64" />
      )}
      <div
        className="absolute inset-0"
        style={{ touchAction: rulerMode ? "none" : "auto" }}
        onPointerDown={onCalibrationPointerDown}
        onPointerMove={onCalibrationPointerMove}
        onDragOver={event => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={event => {
          event.preventDefault();
          const partId = event.dataTransfer.getData("text/plain");
          const rect = event.currentTarget.getBoundingClientRect();
          if (partId) {
            useCanvasStore.getState().addCatalogPartToCanvas(
              partId,
              event.clientX - rect.left,
              event.clientY - rect.top
            );
          }
        }}
      >
        {rulerMode && startPoint && endPoint && (
          <div className="absolute z-30 top-16 md:top-3 left-1/2 -translate-x-1/2 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#181A20]/95 p-2 shadow-xl backdrop-blur-md">
            <input
              ref={calibrationInputRef}
              type="number"
              inputMode="decimal"
              min="0.001"
              step="any"
              aria-label="Measured distance"
              value={calibrationValue}
              onChange={event => setCalibrationValue(event.target.value)}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            />
            <select
              aria-label="Distance unit"
              value={calibrationUnit}
              onChange={event => setCalibrationUnit(event.target.value as "ft" | "in")}
              className="rounded-lg border border-white/10 bg-[#23262E] px-3 py-2 text-sm text-white"
            >
              <option value="ft">ft</option>
              <option value="in">in</option>
            </select>
            <button
              type="button"
              onClick={applyScale}
              disabled={!Number.isFinite(realWorldInches) || realWorldInches <= 0 || pixelDistance <= 0}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              Apply Scale
            </button>
            <button type="button" onClick={cancelCalibration} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80">
              Cancel
            </button>
          </div>
        )}
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onPointerDown={event => {
            if (!rulerMode && event.target === event.target.getStage()) useCanvasStore.getState().setSelectedId(null);
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
              const catalogPart = catalogParts.find(item => item.sku === part.sku);
              const url = catalogPart?.sprites[part.angleVariant];
              return url ? (
                <PartImage
                  key={part.id}
                  id={part.id}
                  url={url}
                  {...part}
                  isSelected={selectedId === part.id}
                  calibrationMode={rulerMode}
                  onSelect={() => useCanvasStore.getState().setSelectedId(part.id)}
                  onChange={patch => useCanvasStore.getState().updatePart(part.id, patch)}
                />
              ) : null;
            })}
            {startPoint && lineEnd && (
              <>
                <Line
                  points={[startPoint.x, startPoint.y, lineEnd.x, lineEnd.y]}
                  stroke="#F59E0B"
                  strokeWidth={3}
                  dash={[8, 6]}
                  lineCap="round"
                  listening={false}
                />
                <Circle x={startPoint.x} y={startPoint.y} radius={7} fill="#F59E0B" stroke="#181A20" strokeWidth={2} listening={false} />
                {endPoint && <Circle x={endPoint.x} y={endPoint.y} radius={7} fill="#F59E0B" stroke="#181A20" strokeWidth={2} listening={false} />}
                <Rect
                  x={(startPoint.x + lineEnd.x) / 2 - 38}
                  y={(startPoint.y + lineEnd.y) / 2 - 30}
                  width={76}
                  height={24}
                  cornerRadius={6}
                  fill="#181A20"
                  stroke="#F59E0B"
                  strokeWidth={1}
                  listening={false}
                />
                <Text
                  x={(startPoint.x + lineEnd.x) / 2 - 38}
                  y={(startPoint.y + lineEnd.y) / 2 - 25}
                  width={76}
                  align="center"
                  text={`${pixelDistance.toFixed(1)} px`}
                  fontSize={12}
                  fill="#FBBF24"
                  listening={false}
                />
              </>
            )}
          </Layer>
        </Stage>
      </div>
    </main>
  );
}
