import * as fabric from "fabric";

export const DETECTED_TYPES = [
  "stage",
  "tent",
  "bathroom",
  "ambulance",
  "medical",
  "generator",
  "food_truck",
  "emergency_exit",
  "fire_extinguisher",
  "text",
  "wall",
  "area",
  "gate",
  "unknown",
] as const;

export type DetectedType = (typeof DETECTED_TYPES)[number];

export type Detected = {
  id: string;
  type: DetectedType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
};

export type AnalysisResult = {
  canvas: {
    width: number;
    height: number;
  };
  objects: Detected[];
};

export type EditableData = {
  id: string;
  name: string;
  type:
    | DetectedType
    | "rectangle"
    | "line"
    | "polygon"
    | "freehand"
    | "measure"
    | "note"
    | "object";
  confidence?: number;
  layerId: string;
  locked?: boolean;
};

export const DEFAULT_LAYER_ID = "main";

const STYLE: Record<DetectedType, { fill: string; stroke: string; symbol: string; label: string }> =
  {
    stage: { fill: "#111827", stroke: "#020617", symbol: "ST", label: "Palco" },
    tent: { fill: "#fef3c7", stroke: "#b45309", symbol: "^", label: "Tenda" },
    bathroom: { fill: "#e0f2fe", stroke: "#0284c7", symbol: "WC", label: "Banheiro" },
    ambulance: { fill: "#fee2e2", stroke: "#dc2626", symbol: "+", label: "Ambulância" },
    medical: { fill: "#dcfce7", stroke: "#16a34a", symbol: "+", label: "Médico" },
    generator: { fill: "#e4e4e7", stroke: "#52525b", symbol: "G", label: "Gerador" },
    food_truck: { fill: "#ffedd5", stroke: "#ea580c", symbol: "FD", label: "Food" },
    emergency_exit: { fill: "#16a34a", stroke: "#15803d", symbol: ">", label: "Saída" },
    fire_extinguisher: { fill: "#fee2e2", stroke: "#dc2626", symbol: "E", label: "Extintor" },
    text: { fill: "transparent", stroke: "#111827", symbol: "T", label: "Texto" },
    wall: { fill: "#f5f5f4", stroke: "#57534e", symbol: "||", label: "Parede" },
    area: { fill: "rgba(20,184,166,0.08)", stroke: "#0f766e", symbol: "A", label: "Área" },
    gate: { fill: "#e0e7ff", stroke: "#4f46e5", symbol: "GT", label: "Portão" },
    unknown: { fill: "#f5f5f5", stroke: "#737373", symbol: "?", label: "Objeto" },
  };

export function getObjectData(object: fabric.Object): EditableData | undefined {
  return (object as fabric.Object & { data?: EditableData }).data;
}

export function setObjectData(object: fabric.Object, data: EditableData) {
  (object as fabric.Object & { data?: EditableData }).data = data;
}

export function makeId(prefix = "obj") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function baseData(obj: Detected): EditableData {
  return {
    id: obj.id || makeId(obj.type),
    name: obj.label,
    type: obj.type,
    confidence: obj.confidence,
    layerId: DEFAULT_LAYER_ID,
  };
}

function decorate(object: fabric.Object, data: EditableData) {
  setObjectData(object, data);
  object.set({
    cornerColor: "#2563eb",
    cornerStrokeColor: "#ffffff",
    borderColor: "#2563eb",
    cornerStyle: "circle",
    transparentCorners: false,
  });
  return object;
}

function scaledObject(obj: Detected, scaleX: number, scaleY: number): Detected {
  return {
    ...obj,
    x: obj.x * scaleX,
    y: obj.y * scaleY,
    width: Math.max(obj.width * scaleX, 18),
    height: Math.max(obj.height * scaleY, 18),
  };
}

export function buildFabricObject(obj: Detected): fabric.Object {
  const style = STYLE[obj.type] ?? STYLE.unknown;

  if (obj.type === "text") {
    return decorate(
      new fabric.IText(obj.label, {
        left: obj.x,
        top: obj.y,
        angle: obj.rotation,
        fontSize: Math.max(14, Math.min(26, obj.height)),
        fontFamily: "Inter, Arial, sans-serif",
        fontWeight: "700",
        fill: style.stroke,
      }),
      baseData(obj),
    );
  }

  if (obj.type === "wall") {
    return decorate(
      new fabric.Rect({
        left: obj.x,
        top: obj.y,
        width: obj.width,
        height: obj.height,
        angle: obj.rotation,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: 4,
      }),
      baseData(obj),
    );
  }

  if (obj.type === "area") {
    return decorate(
      new fabric.Rect({
        left: obj.x,
        top: obj.y,
        width: obj.width,
        height: obj.height,
        angle: obj.rotation,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: 2,
        strokeDashArray: [10, 6],
        rx: 4,
        ry: 4,
      }),
      baseData(obj),
    );
  }

  const rect = new fabric.Rect({
    width: obj.width,
    height: obj.height,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: 2,
    rx: 5,
    ry: 5,
  });
  const symbol = new fabric.FabricText(style.symbol, {
    fontSize: Math.min(22, Math.max(11, Math.min(obj.width, obj.height) * 0.34)),
    fill: obj.type === "stage" || obj.type === "emergency_exit" ? "#ffffff" : style.stroke,
    fontFamily: "Inter, Arial, sans-serif",
    fontWeight: "800",
    originX: "center",
    originY: "center",
    left: obj.width / 2,
    top: Math.max(12, obj.height / 2 - 7),
    selectable: false,
    evented: false,
  });
  const label = new fabric.FabricText(style.label, {
    fontSize: Math.min(12, Math.max(8, obj.width / 8)),
    fill: obj.type === "stage" || obj.type === "emergency_exit" ? "#ffffff" : "#111827",
    fontFamily: "Inter, Arial, sans-serif",
    fontWeight: "700",
    originX: "center",
    originY: "center",
    left: obj.width / 2,
    top: Math.min(obj.height - 10, obj.height / 2 + 14),
    selectable: false,
    evented: false,
  });

  return decorate(
    new fabric.Group([rect, symbol, label], {
      left: obj.x,
      top: obj.y,
      angle: obj.rotation,
    }),
    baseData(obj),
  );
}

export function renderFloorPlan(canvas: fabric.Canvas, analysis: AnalysisResult) {
  canvas.discardActiveObject();
  canvas.getObjects().forEach((object) => {
    if (getObjectData(object)?.layerId !== "guides") canvas.remove(object);
  });

  const scaleX = canvas.getWidth() / Math.max(analysis.canvas.width, 1);
  const scaleY = canvas.getHeight() / Math.max(analysis.canvas.height, 1);
  const sorted = [...analysis.objects].sort((a, b) =>
    a.type === "area" ? -1 : b.type === "area" ? 1 : 0,
  );

  for (const object of sorted) {
    canvas.add(buildFabricObject(scaledObject(object, scaleX, scaleY)));
  }
  canvas.requestRenderAll();
}
