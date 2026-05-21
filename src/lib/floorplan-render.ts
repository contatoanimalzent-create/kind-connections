import * as fabric from "fabric";

export type Detected = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  text?: string;
};

const STROKE = "#0a0a0a";
const FILL_LIGHT = "#ffffff";

function makeIcon(symbol: string, color: string) {
  return (obj: Detected) => {
    const rect = new fabric.Rect({
      width: obj.width,
      height: obj.height,
      fill: FILL_LIGHT,
      stroke: STROKE,
      strokeWidth: 1.5,
      rx: 4,
      ry: 4,
    });
    const text = new fabric.FabricText(symbol, {
      fontSize: Math.min(obj.width, obj.height) * 0.55,
      fill: color,
      fontFamily: "Inter, sans-serif",
      fontWeight: "700",
      originX: "center",
      originY: "center",
      left: obj.width / 2,
      top: obj.height / 2,
    });
    return new fabric.Group([rect, text], {
      left: obj.x,
      top: obj.y,
    });
  };
}

const BUILDERS: Record<string, (o: Detected) => fabric.Object> = {
  area: (o) =>
    new fabric.Rect({
      left: o.x,
      top: o.y,
      width: o.width,
      height: o.height,
      fill: "rgba(0,0,0,0.02)",
      stroke: STROKE,
      strokeWidth: 2.5,
      strokeDashArray: [8, 6],
      rx: 6,
      ry: 6,
    }),
  palco: (o) => {
    const r = new fabric.Rect({
      width: o.width,
      height: o.height,
      fill: "#111111",
      stroke: STROKE,
      strokeWidth: 2,
      rx: 4,
      ry: 4,
    });
    const t = new fabric.FabricText("PALCO", {
      fontSize: 16,
      fill: "#ffffff",
      fontFamily: "Inter, sans-serif",
      fontWeight: "700",
      originX: "center",
      originY: "center",
      left: o.width / 2,
      top: o.height / 2,
    });
    return new fabric.Group([r, t], { left: o.x, top: o.y });
  },
  tenda: (o) => {
    const r = new fabric.Rect({
      width: o.width,
      height: o.height,
      fill: FILL_LIGHT,
      stroke: STROKE,
      strokeWidth: 1.5,
    });
    const tri = new fabric.Polygon(
      [
        { x: 0, y: 0 },
        { x: o.width, y: 0 },
        { x: o.width / 2, y: -14 },
      ],
      { fill: FILL_LIGHT, stroke: STROKE, strokeWidth: 1.5 },
    );
    const t = new fabric.FabricText("TENDA", {
      fontSize: 11,
      fill: STROKE,
      fontFamily: "Inter, sans-serif",
      fontWeight: "600",
      originX: "center",
      originY: "center",
      left: o.width / 2,
      top: o.height / 2,
    });
    return new fabric.Group([tri, r, t], { left: o.x, top: o.y });
  },
  food_truck: makeIcon("🍔", "#000"),
  gerador: makeIcon("⚡", "#000"),
  banheiro: makeIcon("WC", "#000"),
  ambulancia: makeIcon("🚑", "#000"),
  posto_medico: makeIcon("✚", "#c00"),
  extintor: makeIcon("E", "#c00"),
  saida: (o) => {
    const r = new fabric.Rect({
      width: o.width,
      height: o.height,
      fill: "#16a34a",
      stroke: STROKE,
      strokeWidth: 1,
    });
    const t = new fabric.FabricText("SAÍDA", {
      fontSize: 9,
      fill: "#fff",
      fontFamily: "Inter, sans-serif",
      fontWeight: "700",
      originX: "center",
      originY: "center",
      left: o.width / 2,
      top: o.height / 2,
    });
    return new fabric.Group([r, t], { left: o.x, top: o.y });
  },
  texto: (o) =>
    new fabric.FabricText(o.text ?? o.label, {
      left: o.x,
      top: o.y,
      fontSize: 14,
      fontFamily: "Inter, sans-serif",
      fontWeight: "700",
      fill: STROKE,
    }),
};

export function buildFabricObject(obj: Detected): fabric.Object {
  const builder = BUILDERS[obj.type] ?? BUILDERS.tenda;
  const fo = builder(obj);
  (fo as fabric.Object & { data?: unknown }).data = { id: obj.id, type: obj.type, label: obj.label, confidence: obj.confidence };
  return fo;
}

export function renderFloorPlan(canvas: fabric.Canvas, objects: Detected[]) {
  canvas.clear();
  canvas.backgroundColor = "#fafafa";
  // grid
  const gridSize = 40;
  const w = canvas.getWidth();
  const h = canvas.getHeight();
  for (let i = 0; i < w; i += gridSize) {
    canvas.add(
      new fabric.Line([i, 0, i, h], {
        stroke: "#ececec",
        selectable: false,
        evented: false,
        excludeFromExport: false,
      }),
    );
  }
  for (let j = 0; j < h; j += gridSize) {
    canvas.add(
      new fabric.Line([0, j, w, j], {
        stroke: "#ececec",
        selectable: false,
        evented: false,
      }),
    );
  }
  // sort: area first
  const sorted = [...objects].sort((a, b) => (a.type === "area" ? -1 : b.type === "area" ? 1 : 0));
  for (const o of sorted) {
    canvas.add(buildFabricObject(o));
  }
  canvas.requestRenderAll();
}
