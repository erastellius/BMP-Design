import { useEffect, useRef, useState } from "react";
import { Circle, Ellipse, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { Ruler, Undo2, Redo2, Sun, Upload } from "lucide-react";
import type { AngleVariant } from "../data/pergolaCatalog";
import { useCanvasStore, type AiModelOption, type AiReport, type LightingParams } from "../store/useCanvasStore";
import { exportMask } from "../utils/exportMask";

function hexToRgb(hex: string | undefined) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
  if (!match) return null;
  return {
    red: Number.parseInt(match[1], 16),
    green: Number.parseInt(match[2], 16),
    blue: Number.parseInt(match[3], 16)
  };
}

function formatModelSize(bytes: number | undefined) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function modelLabel(model: AiModelOption) {
  if (model.provider === "cloud") {
    return `${model.name}${model.configured ? "" : " (API key not configured)"}`;
  }
  const metadata = [model.parameterSize, formatModelSize(model.fileSize)].filter(Boolean).join(" · ");
  return metadata ? `${model.name} · ${metadata}` : model.name;
}

function PartImage({ id, url, x, y, width, height, rotation, skewX, skewY, isSelected, calibrationMode, lightingParams, onSelect, onChange }: {
  id: string; url: string; x: number; y: number; width: number; height: number; rotation: number;
  skewX: number; skewY: number; isSelected: boolean; calibrationMode: boolean;
  lightingParams: LightingParams | null;
  onSelect: () => void; onChange: (patch: Record<string, number>) => void;
}) {
  const [image] = useImage(url);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const ambientRgb = hexToRgb(lightingParams?.ambientTintHex);
  const ambientTintHex = lightingParams?.ambientTintHex;

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  useEffect(() => {
    const node = shapeRef.current;
    if (!node) return;
    node.clearCache();
    if (image && ambientRgb) {
      node.cache();
      node.getLayer()?.batchDraw();
    }
  }, [image, ambientTintHex, lightingParams?.brightness, lightingParams?.contrast]);

  return <>
    <KonvaImage
      ref={shapeRef}
      image={image}
      x={x} y={y} width={width} height={height}
      rotation={rotation} skewX={skewX} skewY={skewY + (lightingParams?.suggestedSkewY ?? 0)}
      filters={ambientRgb ? [Konva.Filters.RGBA, Konva.Filters.Brighten, Konva.Filters.Contrast] : []}
      red={ambientRgb?.red ?? 0}
      green={ambientRgb?.green ?? 0}
      blue={ambientRgb?.blue ?? 0}
      alpha={ambientRgb ? 0.07 : 1}
      brightness={lightingParams?.brightness ?? 0}
      contrast={lightingParams?.contrast ?? 0}
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

function GroundContactShadow({ x, y, width, height, shadowAngleDeg, shadowOpacity, isPost }: {
  x: number;
  y: number;
  width: number;
  height: number;
  shadowAngleDeg: number;
  shadowOpacity: number;
  isPost: boolean;
}) {
  const radians = shadowAngleDeg * Math.PI / 180;
  const distance = Math.max(8, Math.min(32, Math.max(width, height) * 0.12));
  const ellipseWidth = isPost ? Math.max(14, width * 1.35) : Math.max(24, width * 0.75);
  const ellipseHeight = isPost
    ? Math.max(8, width * 0.35)
    : Math.max(8, Math.min(height * 0.12, width * 0.22));
  const centerX = x + width / 2;
  const baseY = y + height;

  return (
    <Ellipse
      x={centerX}
      y={baseY}
      radiusX={ellipseWidth / 2}
      radiusY={ellipseHeight / 2}
      fill="rgba(15, 12, 8, 0.14)"
      opacity={shadowOpacity}
      shadowEnabled
      shadowColor="rgba(15, 12, 8, 0.65)"
      shadowOffsetX={Math.cos(radians) * distance}
      shadowOffsetY={Math.sin(radians) * distance}
      shadowBlur={24}
      shadowOpacity={shadowOpacity}
      listening={false}
    />
  );
}

export default function DesignCanvas({ thumbnailCaptureKey, onRegisterThumbnailCapture, onRefreshModels }: {
  thumbnailCaptureKey: string;
  onRegisterThumbnailCapture?: (key: string, capture: (() => string | null) | null) => void;
  onRefreshModels?: () => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const canvasShellRef = useRef<HTMLElement>(null);
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
  const selectedModel = useCanvasStore(state => state.selectedModel);
  const availableModels = useCanvasStore(state => state.availableModels);
  const lightingParams = useCanvasStore(state => state.lightingParams);
  const activeLightingParams = selectedModel.startsWith("ollama:") ? lightingParams : null;
  const localModels = availableModels.filter(model => model.provider === "ollama");
  const cloudModels = availableModels.filter(model => model.provider === "cloud");
  const [aiSummary, setAiSummary] = useState("");

  useEffect(() => {
    const resize = () => {
      const el = canvasShellRef.current;
      if (el) setStageSize({ width: el.clientWidth, height: el.clientHeight });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const captureThumbnail = () => {
      const stage = stageRef.current;
      if (!stage ||
          stage.width() <= 0 ||
          stage.height() <= 0 ||
          stage.container().getClientRects().length === 0) return null;
      return stage.toDataURL({ pixelRatio: 0.25, mimeType: "image/jpeg", quality: 0.7 });
    };
    onRegisterThumbnailCapture?.(thumbnailCaptureKey, captureThumbnail);
    return () => onRegisterThumbnailCapture?.(thumbnailCaptureKey, null);
  }, [onRegisterThumbnailCapture, thumbnailCaptureKey]);

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
        body: JSON.stringify({ compositeImage: await composite(), model: useCanvasStore.getState().selectedModel })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const state = useCanvasStore.getState();
      const report: AiReport = {
        modelUsed: data.modelUsed || state.selectedModel,
        timestamp: new Date().toISOString(),
        sunDirection: data.sunDirection || "upper-left",
        shadowAngleDeg: 135,
        shadowBlur: 14,
        shadowOpacity: 0.35,
        ambientTemp: "Warm natural daylight",
        ambientTintHex: "#E8D6B8",
        perspectiveMatch: data.perspectiveHint || "15deg downward pitch",
        appliedAdjustments: ["Scene analysis completed; no canvas adjustments were applied."],
        fullReasoning: data.raw || `${data.sunDirection || "upper-left"} sunlight; ${data.perspectiveHint || "15deg downward pitch"}.`
      };
      state.setLastAiReport(report);
      alert(`${data.sunAngle}\n${data.shadowSoftness}\n${data.cameraPerspective}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Perspective analysis failed");
    } finally { setAnalyzing(false); }
  };

  const blend = async () => {
    setBlending(true);
    try {
      const compositeImage = await composite();
      const model = useCanvasStore.getState().selectedModel;
      const body = model.startsWith("cloud:")
        ? { model, compositeImage, mask: exportMask(stageSize.width, stageSize.height, parts) }
        : { model, compositeImage };
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/blend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json() as {
        error?: string;
        mode?: "local" | "cloud";
        modelUsed?: string;
        lightingParams?: LightingParams;
        edgePrompt?: string;
        prompt?: string;
        imageUrl?: string;
      };
      if (!response.ok) throw new Error(data.error || "AI blend failed");
      if (model.startsWith("ollama:")) {
        if (!data.lightingParams) throw new Error("Local AI returned no lighting parameters");
        useCanvasStore.getState().setLightingParams(data.lightingParams);
        useCanvasStore.getState().setLastAiReport({
          modelUsed: data.modelUsed || model,
          timestamp: new Date().toISOString(),
          sunDirection: data.lightingParams.sunDirection,
          shadowAngleDeg: data.lightingParams.shadowAngleDeg,
          shadowBlur: data.lightingParams.shadowBlur,
          shadowOpacity: data.lightingParams.shadowOpacity,
          ambientTemp: data.lightingParams.ambientTemp,
          ambientTintHex: data.lightingParams.ambientTintHex,
          perspectiveMatch: data.lightingParams.perspectiveMatch,
          appliedAdjustments: [
            `Ground-contact shadow: ${data.lightingParams.shadowAngleDeg}° angle, ${data.lightingParams.shadowBlur}px blur, ${Math.round(data.lightingParams.shadowOpacity * 100)}% opacity.`,
            `Ambient lighting: ${data.lightingParams.ambientTintHex} tint (${data.lightingParams.ambientTemp}).`,
            `Image grading: brightness ${data.lightingParams.brightness}, contrast ${data.lightingParams.contrast}.`
          ],
          fullReasoning: data.lightingParams.fullReasoning || data.edgePrompt || data.lightingParams.lightingSummary
        });
        setAiSummary(data.edgePrompt || data.lightingParams.lightingSummary);
      } else {
        if (!data.imageUrl) throw new Error("Cloud AI returned no blended image");
        useCanvasStore.getState().setAiBlendedUrl(data.imageUrl);
        const lighting = data.lightingParams;
        useCanvasStore.getState().setLastAiReport({
          modelUsed: data.modelUsed || model,
          timestamp: new Date().toISOString(),
          sunDirection: lighting?.sunDirection || "upper-left",
          shadowAngleDeg: lighting?.shadowAngleDeg ?? 135,
          shadowBlur: lighting?.shadowBlur ?? 14,
          shadowOpacity: lighting?.shadowOpacity ?? 0.35,
          ambientTemp: lighting?.ambientTemp || "Warm natural daylight",
          ambientTintHex: lighting?.ambientTintHex || "#E8D6B8",
          perspectiveMatch: lighting?.perspectiveMatch || "Matched using locally analyzed scene perspective.",
          appliedAdjustments: [
            "Generated a photorealistic cloud blend using the composite and protected-area mask.",
            ...(lighting ? [`Lighting prompt: ${lighting.lightingSummary}`] : [])
          ],
          fullReasoning: [
            data.prompt,
            lighting?.fullReasoning && `Scene analysis: ${lighting.fullReasoning}`,
            !data.prompt && !lighting?.fullReasoning ? data.edgePrompt : undefined
          ].filter(Boolean).join("\n\n") || "Cloud image blending completed."
        });
        setAiSummary("Cloud blend applied");
      }
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
    <main ref={canvasShellRef} id="canvas-shell" className="canvas-grid relative h-full min-h-0 overflow-hidden">
      <div className="absolute z-20 left-3 right-3 md:right-auto top-3 flex flex-wrap md:flex-nowrap gap-2">
        <button onClick={() => fileRef.current?.click()} className="rounded-lg panel px-3 py-2 text-xs flex items-center gap-1"><Upload size={14} /> Upload</button>
        <button onClick={toggleCalibration} className={`rounded-lg panel px-3 py-2 text-xs flex items-center gap-1 ${rulerMode ? "text-amber-300" : ""}`}><Ruler size={14} /> {rulerMode ? "Cancel calibration" : "Calibrate"}</button>
        {scaleStatus && <span role="status" className="rounded-lg panel px-2 md:px-3 py-2 text-[10px] md:text-xs text-emerald-300">{scaleStatus}</span>}
        <button onClick={analyze} disabled={analyzing} className="rounded-lg panel px-3 py-2 text-xs flex items-center gap-1"><Sun size={14} /> {analyzing ? "Analyzing…" : "Analyze"}</button>
        <button onClick={() => useCanvasStore.temporal.getState().undo()} className="rounded-lg panel px-2 py-2" title="Undo"><Undo2 size={14} /></button>
        <button onClick={() => useCanvasStore.temporal.getState().redo()} className="rounded-lg panel px-2 py-2" title="Redo"><Redo2 size={14} /></button>
        <select
          aria-label="AI model"
          value={selectedModel}
          onChange={event => useCanvasStore.getState().setSelectedModel(event.target.value)}
          onClick={onRefreshModels}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") onRefreshModels?.();
          }}
          className="max-w-64 rounded-lg border border-white/10 bg-[#23262E] px-3 py-2 text-xs text-white"
        >
          <optgroup label="Local M1 Edge (Ollama)">
            {!localModels.some(model => model.id === selectedModel) && selectedModel.startsWith("ollama:") && (
              <option value={selectedModel}>{selectedModel.slice("ollama:".length)} (not detected)</option>
            )}
            {localModels.length === 0 && !selectedModel.startsWith("ollama:") && (
              <option disabled value="">No local models detected</option>
            )}
            {localModels.map(model => <option key={model.id} value={model.id}>{modelLabel(model)}</option>)}
          </optgroup>
          <optgroup label="Cloud Rendering (API)">
            {cloudModels.map(model => <option key={model.id} value={model.id}>{modelLabel(model)}</option>)}
          </optgroup>
        </select>
        <button onClick={blend} disabled={blending} className="rounded-lg bg-amber-500 text-black px-3 py-2 text-xs font-semibold">{blending ? "Blending…" : "AI Blend"}</button>
        {aiSummary && <span role="status" title={aiSummary} className="max-w-48 truncate rounded-lg panel px-2 py-2 text-[10px] text-white/70">{aiSummary}</span>}
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
          </Layer>
          {activeLightingParams && (
            <Layer listening={false}>
              {parts.map(part => {
                const catalogPart = catalogParts.find(item => item.sku === part.sku);
                if (!catalogPart) return null;
                return (
                  <GroundContactShadow
                    key={part.id}
                    {...part}
                    shadowAngleDeg={activeLightingParams.shadowAngleDeg}
                    shadowOpacity={activeLightingParams.shadowOpacity}
                    isPost={catalogPart.category === "Posts" && catalogPart.widthInches === 8}
                  />
                );
              })}
            </Layer>
          )}
          <Layer>
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
                  lightingParams={activeLightingParams}
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
