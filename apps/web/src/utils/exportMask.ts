export function exportMask(
  width: number,
  height: number,
  parts: Array<{ x: number; y: number; width: number; height: number; rotation: number }>,
  featherPx = 18
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = featherPx;
  for (const part of parts) {
    ctx.save();
    ctx.translate(part.x + part.width / 2, part.y + part.height / 2);
    ctx.rotate(part.rotation * Math.PI / 180);
    ctx.fillRect(-part.width / 2 - 2, -part.height / 2 - 2, part.width + 4, part.height + 4);
    ctx.restore();
  }
  ctx.restore();

  // Interior and exact geometry remain protected; only the editable border and shadow zones are white.
  ctx.globalCompositeOperation = "source-out";
  ctx.fillStyle = "#000";
  for (const part of parts) {
    ctx.save();
    ctx.translate(part.x + part.width / 2, part.y + part.height / 2);
    ctx.rotate(part.rotation * Math.PI / 180);
    ctx.fillRect(-part.width / 2 + featherPx, -part.height / 2 + featherPx, part.width - featherPx * 2, part.height - featherPx * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";
  return canvas.toDataURL("image/png");
}
