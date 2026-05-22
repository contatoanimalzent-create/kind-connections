import * as fabric from "fabric";
import type {
  FloorPlanData,
  LayerBoundary,
  LayerIcon,
  LayerLegend,
  LayerText,
  LayerZone,
  LayerVisibility,
  RenderMode,
} from "./floorplan-types";

const ICON_SYMBOLS: Record<string, { symbol: string; color: string; bg: string }> = {
  palco: { symbol: "PALCO", color: "#ffffff", bg: "#111111" },
  tenda: { symbol: "TENDA", color: "#111", bg: "#ffffff" },
  food_truck: { symbol: "🍔", color: "#111", bg: "#fff7ed" },
  banheiro: { symbol: "WC", color: "#111", bg: "#eef2ff" },
  gerador: { symbol: "⚡", color: "#111", bg: "#fef9c3" },
  ambulancia: { symbol: "🚑", color: "#fff", bg: "#dc2626" },
  posto_medico: { symbol: "✚", color: "#fff", bg: "#dc2626" },
  saida: { symbol: "SAÍDA", color: "#fff", bg: "#16a34a" },
  extintor: { symbol: "E", color: "#fff", bg: "#dc2626" },
  unknown: { symbol: "?", color: "#111", bg: "#f3f4f6" },
};

function scalePt(p: [number, number], W: number, H: number): [number, number] {
  return [p[0] * W, p[1] * H];
}

function tagLayer(obj: fabric.Object, layer: string, dataId?: string) {
  (obj as fabric.Object & { data?: unknown }).data = { layer, id: dataId };
}

function addBoundary(canvas: fabric.Canvas, b: LayerBoundary, W: number, H: number, mode: RenderMode) {
  const stroke = b.stroke ?? (mode === "clean" ? "#0a0a0a" : "#1f2937");
  const strokeWidth = b.strokeWidth ?? 2;
  const dash = b.dashed ? [8, 6] : undefined;
  let obj: fabric.Object | null = null;
  if (b.shape === "rect" && b.bbox) {
    const [x, y, w, h] = b.bbox;
    obj = new fabric.Rect({
      left: x * W,
      top: y * H,
      width: w * W,
      height: h * H,
      fill: b.fill ?? "transparent",
      stroke,
      strokeWidth,
      strokeDashArray: dash,
    });
  } else if (b.points && b.points.length >= 2) {
    const pts = b.points.map((p) => ({ x: p[0] * W, y: p[1] * H }));
    if (b.shape === "polygon") {
      obj = new fabric.Polygon(pts, { fill: b.fill ?? "transparent", stroke, strokeWidth, strokeDashArray: dash });
    } else {
      obj = new fabric.Polyline(pts, { fill: "", stroke, strokeWidth, strokeDashArray: dash });
    }
  }
  if (obj) {
    tagLayer(obj, "boundaries", b.id);
    canvas.add(obj);
  }
}

function addZone(canvas: fabric.Canvas, z: LayerZone, W: number, H: number, mode: RenderMode) {
  const opacity = z.opacity ?? (mode === "clean" ? 0.25 : 0.55);
  let obj: fabric.Object | null = null;
  if (z.shape === "rect" && z.bbox) {
    const [x, y, w, h] = z.bbox;
    obj = new fabric.Rect({
      left: x * W,
      top: y * H,
      width: w * W,
      height: h * H,
      fill: z.fill,
      opacity,
      stroke: "transparent",
    });
  } else if (z.points && z.points.length >= 3) {
    const pts = z.points.map((p) => ({ x: p[0] * W, y: p[1] * H }));
    obj = new fabric.Polygon(pts, { fill: z.fill, opacity, stroke: "transparent" });
  }
  if (obj) {
    tagLayer(obj, "zones", z.id);
    canvas.add(obj);
  }
}

function addIcon(canvas: fabric.Canvas, ic: LayerIcon, W: number, H: number, mode: RenderMode) {
  const [x, y, w, h] = ic.bbox;
  const px = x * W;
  const py = y * H;
  const pw = Math.max(8, w * W);
  const ph = Math.max(8, h * H);
  const meta = ICON_SYMBOLS[ic.type] ?? ICON_SYMBOLS.unknown;
  const bg = ic.color ?? meta.bg;

  const rect = new fabric.Rect({
    width: pw,
    height: ph,
    fill: bg,
    stroke: "#0a0a0a",
    strokeWidth: mode === "clean" ? 1.5 : 1,
    rx: 4,
    ry: 4,
  });
  const label = ic.type === "unknown" ? ic.label || "?" : meta.symbol;
  const fontSize = Math.max(9, Math.min(pw, ph) * (label.length > 4 ? 0.28 : 0.5));
  const txt = new fabric.FabricText(label, {
    fontSize,
    fill: meta.color,
    fontFamily: "Inter, sans-serif",
    fontWeight: "700",
    originX: "center",
    originY: "center",
    left: pw / 2,
    top: ph / 2,
  });
  const grp = new fabric.Group([rect, txt], { left: px, top: py });
  tagLayer(grp, "icons", ic.id);
  canvas.add(grp);
}

function addText(canvas: fabric.Canvas, t: LayerText, W: number, H: number) {
  const fs = Math.max(8, t.fontSize * H);
  const obj = new fabric.FabricText(t.text, {
    left: t.x * W,
    top: t.y * H,
    fontSize: fs,
    fill: t.color ?? "#0a0a0a",
    fontWeight: t.weight === "bold" ? "700" : "500",
    fontFamily: "Inter, sans-serif",
    angle: t.rotation ?? 0,
  });
  tagLayer(obj, "texts", t.id);
  canvas.add(obj);
}

function addLegend(canvas: fabric.Canvas, lg: LayerLegend, W: number, H: number) {
  const [x, y, w, h] = lg.bbox;
  const px = x * W;
  const py = y * H;
  const pw = Math.max(80, w * W);
  const ph = Math.max(40, h * H);
  const bg = new fabric.Rect({
    width: pw,
    height: ph,
    fill: "#ffffff",
    stroke: "#0a0a0a",
    strokeWidth: 1,
    rx: 4,
    ry: 4,
  });
  const children: fabric.Object[] = [bg];
  const lineH = Math.min(20, ph / Math.max(1, lg.items.length));
  lg.items.forEach((it, i) => {
    const top = 6 + i * lineH;
    if (it.color) {
      children.push(
        new fabric.Rect({ left: 8, top: top + 2, width: 12, height: 12, fill: it.color, stroke: "#0a0a0a", strokeWidth: 0.5 }),
      );
    }
    children.push(
      new fabric.FabricText(`${it.symbol ?? ""} ${it.label}`.trim(), {
        left: 26,
        top,
        fontSize: 11,
        fill: "#0a0a0a",
        fontFamily: "Inter, sans-serif",
      }),
    );
  });
  const grp = new fabric.Group(children, { left: px, top: py });
  tagLayer(grp, "legend", lg.id);
  canvas.add(grp);
}

async function addBackgroundReference(canvas: fabric.Canvas, url: string, W: number, H: number, mode: RenderMode) {
  const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
  img.set({
    left: 0,
    top: 0,
    selectable: false,
    evented: false,
    opacity: mode === "high_fidelity" ? 0.35 : 0.08,
  });
  img.scaleToWidth(W);
  if (img.getScaledHeight() < H) img.scaleToHeight(H);
  tagLayer(img, "background_reference", "bg");
  canvas.add(img);
  canvas.sendObjectToBack(img);
}

function drawGrid(canvas: fabric.Canvas, W: number, H: number) {
  const step = 40;
  for (let i = 0; i <= W; i += step) {
    const l = new fabric.Line([i, 0, i, H], { stroke: "#eef0f3", selectable: false, evented: false });
    tagLayer(l, "grid", `gx-${i}`);
    canvas.add(l);
  }
  for (let j = 0; j <= H; j += step) {
    const l = new fabric.Line([0, j, W, j], { stroke: "#eef0f3", selectable: false, evented: false });
    tagLayer(l, "grid", `gy-${j}`);
    canvas.add(l);
  }
}

export async function renderFloorPlanLayered(
  canvas: fabric.Canvas,
  data: FloorPlanData,
  mode: RenderMode,
  visibility: LayerVisibility,
) {
  const W = canvas.getWidth();
  const H = canvas.getHeight();
  canvas.clear();
  canvas.backgroundColor = "#fafafa";

  if (mode === "clean") drawGrid(canvas, W, H);

  if (visibility.background_reference && data.imageUrl) {
    try {
      await addBackgroundReference(canvas, data.imageUrl, W, H, mode);
    } catch (e) {
      console.warn("bg ref failed", e);
    }
  }
  if (visibility.zones) data.layers.zones.forEach((z) => addZone(canvas, z, W, H, mode));
  if (visibility.boundaries) data.layers.boundaries.forEach((b) => addBoundary(canvas, b, W, H, mode));
  if (visibility.icons) data.layers.icons.forEach((ic) => addIcon(canvas, ic, W, H, mode));
  if (visibility.texts) data.layers.texts.forEach((t) => addText(canvas, t, W, H));
  if (visibility.legend) data.layers.legend.forEach((lg) => addLegend(canvas, lg, W, H));

  canvas.requestRenderAll();
}
