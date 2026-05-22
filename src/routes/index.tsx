import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
} from "react";
import * as fabric from "fabric";
import jsPDF from "jspdf";
import {
  ArrowUpRight,
  Box,
  BringToFront,
  CircleOff,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileImage,
  Hand,
  ImageUp,
  Layers,
  LineChart,
  Loader2,
  Lock,
  Map,
  MousePointer2,
  Move,
  Palette,
  Pencil,
  Pentagon,
  RectangleHorizontal,
  Ruler,
  Save,
  Sparkles,
  SquareDashedMousePointer,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  DEFAULT_LAYER_ID,
  buildFabricObject,
  getObjectData,
  makeId,
  renderFloorPlan,
  setObjectData,
  type AnalysisResult,
  type Detected,
  type DetectedType,
  type EditableData,
} from "@/lib/floorplan-render";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Auto Planta IA - Editor profissional de plantas" },
      {
        name: "description",
        content:
          "Transforme imagens em plantas editaveis com IA e refine tudo em um editor estilo Figma/Canva/Floorplanner.",
      },
    ],
  }),
});

const CANVAS_W = 1400;
const CANVAS_H = 900;
const GRID = 20;

type Tool =
  | "select"
  | "hand"
  | "rect"
  | "line"
  | "arrow"
  | "polygon"
  | "pen"
  | "text"
  | "measure"
  | "eraser"
  | "area"
  | "object";

type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

type LayerRow = {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

const FALLBACK_LABEL: Record<DetectedType, string> = {
  stage: "Palco",
  tent: "Tenda",
  bathroom: "Banheiro",
  ambulance: "Ambulancia",
  medical: "Posto medico",
  generator: "Gerador",
  food_truck: "Food truck",
  emergency_exit: "Saida de emergencia",
  fire_extinguisher: "Extintor",
  text: "Texto",
  wall: "Parede",
  area: "Area",
  gate: "Portao",
  unknown: "Objeto",
};

const TOOL_ITEMS: Array<{ id: Tool; label: string; icon: ComponentType<{ className?: string }> }> =
  [
    { id: "select", label: "Selecionar", icon: MousePointer2 },
    { id: "hand", label: "Mover tela", icon: Hand },
    { id: "rect", label: "Retangulo", icon: RectangleHorizontal },
    { id: "line", label: "Linha", icon: LineChart },
    { id: "arrow", label: "Seta", icon: ArrowUpRight },
    { id: "polygon", label: "Poligono", icon: Pentagon },
    { id: "pen", label: "Caneta livre", icon: Pencil },
    { id: "text", label: "Texto", icon: Type },
    { id: "measure", label: "Medida", icon: Ruler },
    { id: "eraser", label: "Borracha", icon: CircleOff },
    { id: "area", label: "Area/zona", icon: SquareDashedMousePointer },
    { id: "object", label: "Icone/objeto", icon: Box },
  ];

function dataOf(object: fabric.Object): EditableData {
  const data = getObjectData(object);
  if (data) return data;
  const fallback = {
    id: makeId("obj"),
    name: object.type ?? "Objeto",
    type: "object" as const,
    layerId: DEFAULT_LAYER_ID,
  };
  setObjectData(object, fallback);
  return fallback;
}

function applyEditorControls(object: fabric.Object) {
  object.set({
    cornerColor: "#2563eb",
    cornerStrokeColor: "#ffffff",
    borderColor: "#2563eb",
    cornerStyle: "circle",
    transparentCorners: false,
  });
}

function normalizedAngle(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectBounds(object: fabric.Object) {
  return {
    x: Math.round(object.left ?? 0),
    y: Math.round(object.top ?? 0),
    width: Math.round((object.width ?? 0) * (object.scaleX ?? 1)),
    height: Math.round((object.height ?? 0) * (object.scaleY ?? 1)),
    rotation: Math.round(normalizedAngle(object.angle)),
  };
}

function setObjectLock(object: fabric.Object, locked: boolean) {
  object.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
  });
  const data = dataOf(object);
  setObjectData(object, { ...data, locked });
}

function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID) * GRID : value;
}

function setPaint(object: fabric.Object, patch: { fill?: string; stroke?: string }) {
  object.set(patch);
  if (object instanceof fabric.Group) {
    object.getObjects().forEach((child) => {
      if (patch.fill && child.type !== "text" && child.type !== "i-text")
        child.set("fill", patch.fill);
      if (patch.stroke && "stroke" in child) child.set("stroke", patch.stroke);
    });
  }
}

function callFabricOrder(
  object: fabric.Object,
  method: "bringToFront" | "sendToBack" | "bringForward" | "sendBackwards",
) {
  const ordered = object as unknown as {
    bringToFront?: () => void;
    sendToBack?: () => void;
    bringForward?: () => void;
    sendBackwards?: () => void;
  };
  ordered[method]?.();
}

function Index() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const drawingRef = useRef<{
    startX: number;
    startY: number;
    object?: fabric.Object;
    isDraggingViewport?: boolean;
    lastX?: number;
    lastY?: number;
  } | null>(null);
  const polygonPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const restoringRef = useRef(false);
  const spaceDownRef = useRef(false);
  const toolRef = useRef<Tool>("select");
  const activeLayerRef = useRef(DEFAULT_LAYER_ID);
  const snapRef = useRef(true);
  const fillRef = useRef("#ffffff");
  const strokeRef = useRef("#111827");
  const opacityRef = useRef(1);

  const [tool, setTool] = useState<Tool>("select");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [objects, setObjects] = useState<Detected[]>([]);
  const [layers, setLayers] = useState<Layer[]>([
    { id: DEFAULT_LAYER_ID, name: "Objetos", visible: true, locked: false, opacity: 1 },
    { id: "notes", name: "Anotacoes", visible: true, locked: false, opacity: 1 },
  ]);
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER_ID);
  const [layerRows, setLayerRows] = useState<LayerRow[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [fillColor, setFillColor] = useState("#ffffff");
  const [strokeColor, setStrokeColor] = useState("#111827");
  const [opacity, setOpacity] = useState(1);
  const [revision, setRevision] = useState(0);

  const selectedData = selectedObject ? dataOf(selectedObject) : null;
  const selectedBounds = selectedObject ? objectBounds(selectedObject) : null;

  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) ?? layers[0],
    [activeLayerId, layers],
  );

  useEffect(() => {
    toolRef.current = tool;
    activeLayerRef.current = activeLayerId;
    snapRef.current = snapToGrid;
    fillRef.current = fillColor;
    strokeRef.current = strokeColor;
    opacityRef.current = opacity;
  }, [activeLayerId, fillColor, opacity, snapToGrid, strokeColor, tool]);

  const refreshLayers = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rows = canvas
      .getObjects()
      .filter((object) => dataOf(object).layerId !== "guides")
      .map((object) => {
        const data = dataOf(object);
        return {
          id: data.id,
          name: data.name,
          type: data.type,
          visible: object.visible !== false,
          locked: data.locked === true,
          opacity: object.opacity ?? 1,
        };
      })
      .reverse();
    setLayerRows(rows);
    setRevision((value) => value + 1);
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || restoringRef.current) return;
    const json = JSON.stringify(canvas.toJSON(["data", "selectable", "evented"]));
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (next[next.length - 1] === json) return;
    next.push(json);
    historyRef.current = next.slice(-80);
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const updateMiniMap = useCallback(() => {
    const canvas = fabricRef.current;
    const mini = miniCanvasRef.current;
    if (!canvas || !mini) return;
    const ctx = mini.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, mini.width, mini.height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, mini.width, mini.height);
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(0, 0, mini.width, mini.height);
    const scaleX = mini.width / canvas.getWidth();
    const scaleY = mini.height / canvas.getHeight();
    for (const object of canvas.getObjects()) {
      const data = dataOf(object);
      if (data.layerId === "guides" || object.visible === false) continue;
      const b = object.getBoundingRect();
      ctx.fillStyle = data.type === "area" ? "rgba(20,184,166,.18)" : "rgba(37,99,235,.45)";
      ctx.fillRect(
        b.left * scaleX,
        b.top * scaleY,
        Math.max(2, b.width * scaleX),
        Math.max(2, b.height * scaleY),
      );
    }
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    const z = canvas.getZoom();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      (-vpt[4] / z) * scaleX,
      (-vpt[5] / z) * scaleY,
      (canvas.getWidth() / z) * scaleX,
      (canvas.getHeight() / z) * scaleY,
    );
  }, []);

  const drawGuides = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((object) => {
      if (dataOf(object).layerId === "guides") canvas.remove(object);
    });
    if (!showGrid) {
      canvas.requestRenderAll();
      return;
    }
    for (let x = 0; x <= CANVAS_W; x += GRID) {
      const line = new fabric.Line([x, 0, x, CANVAS_H], {
        stroke: x % 100 === 0 ? "#dbe4ef" : "#eef2f7",
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      setObjectData(line, {
        id: makeId("grid"),
        name: "Grid",
        type: "line",
        layerId: "guides",
        locked: true,
      });
      canvas.add(line);
      callFabricOrder(line, "sendToBack");
    }
    for (let y = 0; y <= CANVAS_H; y += GRID) {
      const line = new fabric.Line([0, y, CANVAS_W, y], {
        stroke: y % 100 === 0 ? "#dbe4ef" : "#eef2f7",
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      setObjectData(line, {
        id: makeId("grid"),
        name: "Grid",
        type: "line",
        layerId: "guides",
        locked: true,
      });
      canvas.add(line);
      callFabricOrder(line, "sendToBack");
    }
    canvas.requestRenderAll();
  }, [showGrid]);

  const centerCanvas = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(1);
    setZoom(1);
    canvas.requestRenderAll();
    updateMiniMap();
  }, [updateMiniMap]);

  const setCanvasTool = useCallback((nextTool: Tool) => {
    const canvas = fabricRef.current;
    setTool(nextTool);
    if (!canvas) return;
    canvas.isDrawingMode = nextTool === "pen";
    canvas.selection = nextTool === "select";
    canvas.defaultCursor = nextTool === "hand" ? "grab" : "default";
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = strokeRef.current;
      canvas.freeDrawingBrush.width = 3;
    }
  }, []);

  const addEditableObject = useCallback(
    (object: fabric.Object, data: EditableData) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      applyEditorControls(object);
      setObjectData(object, { ...data, layerId: data.layerId || activeLayerRef.current });
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      setSelectedObject(object);
      refreshLayers();
      saveHistory();
      updateMiniMap();
    },
    [refreshLayers, saveHistory, updateMiniMap],
  );

  const addObjectByType = useCallback(
    (type: DetectedType) => {
      const detected: Detected = {
        id: makeId(type),
        type,
        label: FALLBACK_LABEL[type],
        x: 280,
        y: 220,
        width: type === "fire_extinguisher" ? 32 : type === "text" ? 150 : 120,
        height: type === "fire_extinguisher" ? 32 : type === "text" ? 28 : 80,
        rotation: 0,
        confidence: 1,
      };
      const object = buildFabricObject(detected);
      const data = dataOf(object);
      setObjectData(object, { ...data, layerId: activeLayerRef.current });
      addEditableObject(object, dataOf(object));
    },
    [addEditableObject],
  );

  const deleteSelection = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    active.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    setSelectedObject(null);
    refreshLayers();
    saveHistory();
    updateMiniMap();
  }, [refreshLayers, saveHistory, updateMiniMap]);

  const duplicateSelection = useCallback(async () => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    const clone = await active.clone(["data"]);
    const data = dataOf(active);
    const nextData = { ...data, id: makeId(data.type), name: `${data.name} copia` };
    clone.set({
      left: (active.left ?? 0) + 24,
      top: (active.top ?? 0) + 24,
    });
    applyEditorControls(clone);
    setObjectData(clone, nextData);
    canvas.add(clone);
    canvas.setActiveObject(clone);
    setSelectedObject(clone);
    canvas.requestRenderAll();
    refreshLayers();
    saveHistory();
    updateMiniMap();
  }, [refreshLayers, saveHistory, updateMiniMap]);

  const loadHistory = useCallback(
    (index: number) => {
      const canvas = fabricRef.current;
      const snapshot = historyRef.current[index];
      if (!canvas || !snapshot) return;
      restoringRef.current = true;
      void canvas.loadFromJSON(snapshot).then(() => {
        canvas.getObjects().forEach(applyEditorControls);
        canvas.requestRenderAll();
        restoringRef.current = false;
        historyIndexRef.current = index;
        setSelectedObject(null);
        refreshLayers();
        updateMiniMap();
      });
    },
    [refreshLayers, updateMiniMap],
  );

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    loadHistory(historyIndexRef.current - 1);
  }, [loadHistory]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    loadHistory(historyIndexRef.current + 1);
  }, [loadHistory]);

  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#fafafa",
      preserveObjectStacking: true,
      fireRightClick: true,
      stopContextMenu: true,
    });
    fabricRef.current = canvas;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = strokeRef.current;
    canvas.freeDrawingBrush.width = 3;

    canvas.on("selection:created", (e) => setSelectedObject(e.selected?.[0] ?? null));
    canvas.on("selection:updated", (e) => setSelectedObject(e.selected?.[0] ?? null));
    canvas.on("selection:cleared", () => setSelectedObject(null));
    canvas.on("object:modified", () => {
      const active = canvas.getActiveObject();
      if (active && snapRef.current) {
        active.set({ left: snap(active.left ?? 0, true), top: snap(active.top ?? 0, true) });
      }
      refreshLayers();
      saveHistory();
      updateMiniMap();
    });
    canvas.on("path:created", (event) => {
      const path = event.path;
      if (!path) return;
      applyEditorControls(path);
      setObjectData(path, {
        id: makeId("freehand"),
        name: "Croqui",
        type: "freehand",
        layerId: activeLayerRef.current,
      });
      refreshLayers();
      saveHistory();
      updateMiniMap();
    });
    canvas.on("mouse:wheel", (opt) => {
      const event = opt.e;
      const delta = event.deltaY;
      let nextZoom = canvas.getZoom();
      nextZoom *= 0.999 ** delta;
      nextZoom = Math.min(5, Math.max(0.25, nextZoom));
      canvas.zoomToPoint(new fabric.Point(event.offsetX, event.offsetY), nextZoom);
      setZoom(nextZoom);
      event.preventDefault();
      event.stopPropagation();
      updateMiniMap();
    });
    canvas.on("mouse:down", (opt) => {
      const pointer = canvas.getPointer(opt.e);
      const currentTool = toolRef.current;
      if (currentTool === "hand" || spaceDownRef.current) {
        drawingRef.current = {
          startX: pointer.x,
          startY: pointer.y,
          isDraggingViewport: true,
          lastX: opt.e.clientX,
          lastY: opt.e.clientY,
        };
        canvas.defaultCursor = "grabbing";
        return;
      }
      if (currentTool === "eraser" && opt.target) {
        canvas.remove(opt.target);
        refreshLayers();
        saveHistory();
        updateMiniMap();
        return;
      }
      if (currentTool === "text") {
        const text = new fabric.IText("Texto", {
          left: snap(pointer.x, snapRef.current),
          top: snap(pointer.y, snapRef.current),
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 24,
          fill: strokeRef.current,
        });
        addEditableObject(text, {
          id: makeId("text"),
          name: "Texto",
          type: "note",
          layerId: activeLayerRef.current,
        });
        text.enterEditing();
        return;
      }
      if (currentTool === "object") {
        addObjectByType("unknown");
        return;
      }
      if (currentTool === "polygon") {
        polygonPointsRef.current.push({
          x: snap(pointer.x, snapRef.current),
          y: snap(pointer.y, snapRef.current),
        });
        if (polygonPointsRef.current.length >= 3 && opt.e.detail >= 2) {
          const points = polygonPointsRef.current;
          polygonPointsRef.current = [];
          addEditableObject(
            new fabric.Polygon(points, {
              fill: "rgba(37,99,235,0.12)",
              stroke: strokeRef.current,
              strokeWidth: 2,
            }),
            {
              id: makeId("polygon"),
              name: "Poligono",
              type: "polygon",
              layerId: activeLayerRef.current,
            },
          );
        }
        return;
      }
      if (currentTool === "rect" || currentTool === "area") {
        const rect = new fabric.Rect({
          left: snap(pointer.x, snapRef.current),
          top: snap(pointer.y, snapRef.current),
          width: 1,
          height: 1,
          fill: currentTool === "area" ? "rgba(20,184,166,0.12)" : fillRef.current,
          stroke: currentTool === "area" ? "#0f766e" : strokeRef.current,
          strokeWidth: 2,
          strokeDashArray: currentTool === "area" ? [10, 6] : undefined,
          opacity: opacityRef.current,
        });
        drawingRef.current = { startX: pointer.x, startY: pointer.y, object: rect };
        canvas.add(rect);
        return;
      }
      if (currentTool === "line" || currentTool === "measure" || currentTool === "arrow") {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: strokeRef.current,
          strokeWidth: 2,
        });
        drawingRef.current = { startX: pointer.x, startY: pointer.y, object: line };
        canvas.add(line);
      }
    });
    canvas.on("mouse:move", (opt) => {
      const draft = drawingRef.current;
      if (!draft) return;
      if (draft.isDraggingViewport) {
        const e = opt.e;
        const vpt = canvas.viewportTransform;
        if (!vpt || draft.lastX === undefined || draft.lastY === undefined) return;
        vpt[4] += e.clientX - draft.lastX;
        vpt[5] += e.clientY - draft.lastY;
        draft.lastX = e.clientX;
        draft.lastY = e.clientY;
        canvas.requestRenderAll();
        updateMiniMap();
        return;
      }
      const pointer = canvas.getPointer(opt.e);
      if (draft.object instanceof fabric.Rect) {
        draft.object.set({
          width: Math.abs(pointer.x - draft.startX),
          height: Math.abs(pointer.y - draft.startY),
          left: snap(Math.min(pointer.x, draft.startX), snapRef.current),
          top: snap(Math.min(pointer.y, draft.startY), snapRef.current),
        });
        draft.object.setCoords();
        canvas.requestRenderAll();
      } else if (draft.object instanceof fabric.Line) {
        draft.object.set({
          x2: snap(pointer.x, snapRef.current),
          y2: snap(pointer.y, snapRef.current),
        });
        draft.object.setCoords();
        canvas.requestRenderAll();
      }
    });
    canvas.on("mouse:up", () => {
      const draft = drawingRef.current;
      drawingRef.current = null;
      const currentTool = toolRef.current;
      canvas.defaultCursor = currentTool === "hand" ? "grab" : "default";
      if (!draft?.object) return;
      const object = draft.object;
      if (object instanceof fabric.Line && currentTool === "measure") {
        const length = Math.hypot(
          (object.x2 ?? 0) - (object.x1 ?? 0),
          (object.y2 ?? 0) - (object.y1 ?? 0),
        );
        const label = new fabric.FabricText(`${Math.round(length)} px`, {
          left: ((object.x1 ?? 0) + (object.x2 ?? 0)) / 2 + 8,
          top: ((object.y1 ?? 0) + (object.y2 ?? 0)) / 2 + 8,
          fontSize: 13,
          fill: strokeRef.current,
          backgroundColor: "#ffffff",
        });
        const group = new fabric.Group([object, label]);
        canvas.remove(object);
        addEditableObject(group, {
          id: makeId("measure"),
          name: "Medida",
          type: "measure",
          layerId: activeLayerRef.current,
        });
        return;
      }
      if (object instanceof fabric.Line && currentTool === "arrow") {
        const x1 = object.x1 ?? 0;
        const y1 = object.y1 ?? 0;
        const x2 = object.x2 ?? 0;
        const y2 = object.y2 ?? 0;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        const line = new fabric.Line([0, 0, dx, dy], { stroke: strokeRef.current, strokeWidth: 2 });
        const head = new fabric.Triangle({
          left: dx,
          top: dy,
          width: 14,
          height: 14,
          angle,
          fill: strokeRef.current,
          originX: "center",
          originY: "center",
        });
        const group = new fabric.Group([line, head], { left: x1, top: y1 });
        canvas.remove(object);
        addEditableObject(group, {
          id: makeId("arrow"),
          name: "Seta",
          type: "line",
          layerId: activeLayerRef.current,
        });
        return;
      }
      applyEditorControls(object);
      setObjectData(object, {
        id: makeId(currentTool),
        name: currentTool === "area" ? "Área" : currentTool === "line" ? "Linha" : "Retângulo",
        type: currentTool === "area" ? "area" : currentTool === "line" ? "line" : "rectangle",
        layerId: activeLayerRef.current,
      });
      canvas.setActiveObject(object);
      setSelectedObject(object);
      refreshLayers();
      saveHistory();
      updateMiniMap();
    });

    drawGuides();
    saveHistory();
    updateMiniMap();

    return () => {
      canvas.dispose();
      fabricRef.current = null;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.code === "Space") {
        spaceDownRef.current = true;
        event.preventDefault();
      }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "d") {
          event.preventDefault();
          duplicateSelection();
        } else if (key === "z") {
          event.preventDefault();
          undo();
        } else if (key === "y") {
          event.preventDefault();
          redo();
        } else if (key === "s") {
          event.preventDefault();
          toast.success("Projeto salvo no navegador");
          saveHistory();
        } else if (key === "e") {
          event.preventDefault();
          exportPNG();
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") deleteSelection();
      if (event.key.toLowerCase() === "v") setCanvasTool("select");
      if (event.key.toLowerCase() === "h") setCanvasTool("hand");
      if (event.key.toLowerCase() === "r") setCanvasTool("rect");
      if (event.key.toLowerCase() === "l") setCanvasTool("line");
      if (event.key.toLowerCase() === "p") setCanvasTool("pen");
      if (event.key.toLowerCase() === "t") setCanvasTool("text");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceDownRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [deleteSelection, duplicateSelection, redo, saveHistory, setCanvasTool, undo]);

  useEffect(() => {
    drawGuides();
    updateMiniMap();
  }, [drawGuides, showGrid, updateMiniMap]);

  const handleFile = (file: File) => {
    setImageFile(file);
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImageUrl(url);
    setGenerated(false);
    setObjects([]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  };

  const generate = useCallback(async () => {
    if (!imageFile) {
      toast.error("Faca upload de uma imagem primeiro");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", imageFile);
      const res = await fetch("/api/analyze-image", { method: "POST", body: fd });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha na analise");
      }
      const data = (await res.json()) as AnalysisResult;
      setObjects(data.objects);
      const canvas = fabricRef.current;
      if (canvas) {
        renderFloorPlan(canvas, data);
        canvas.getObjects().forEach(applyEditorControls);
        drawGuides();
      }
      setGenerated(true);
      refreshLayers();
      saveHistory();
      updateMiniMap();
      toast.success(`${data.objects.length} objetos editaveis criados`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar planta baixa");
    } finally {
      setLoading(false);
    }
  }, [drawGuides, imageFile, refreshLayers, saveHistory, updateMiniMap]);

  const updateSelected = (
    patch: Partial<{
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      fill: string;
      stroke: string;
      opacity: number;
    }>,
  ) => {
    const object = selectedObject;
    const canvas = fabricRef.current;
    if (!object || !canvas) return;
    const data = dataOf(object);
    if (patch.name !== undefined) {
      setObjectData(object, { ...data, name: patch.name });
      if (object instanceof fabric.IText) object.set({ text: patch.name });
    }
    if (patch.x !== undefined) object.set({ left: patch.x });
    if (patch.y !== undefined) object.set({ top: patch.y });
    if (patch.rotation !== undefined) object.set({ angle: patch.rotation });
    if (patch.opacity !== undefined) object.set({ opacity: patch.opacity });
    if (patch.width !== undefined && object.width)
      object.set({ scaleX: patch.width / object.width });
    if (patch.height !== undefined && object.height)
      object.set({ scaleY: patch.height / object.height });
    if (patch.fill !== undefined || patch.stroke !== undefined) {
      setPaint(object, { fill: patch.fill, stroke: patch.stroke });
    }
    object.setCoords();
    canvas.requestRenderAll();
    refreshLayers();
    updateMiniMap();
  };

  const commitSelected = () => {
    saveHistory();
    refreshLayers();
  };

  const toggleLayerObject = (id: string, key: "visible" | "locked") => {
    const canvas = fabricRef.current;
    const object = canvas?.getObjects().find((candidate) => dataOf(candidate).id === id);
    if (!canvas || !object) return;
    if (key === "visible") object.set({ visible: object.visible === false });
    if (key === "locked") setObjectLock(object, !dataOf(object).locked);
    canvas.requestRenderAll();
    refreshLayers();
    saveHistory();
    updateMiniMap();
  };

  const moveObject = (id: string, direction: "front" | "back" | "up" | "down") => {
    const canvas = fabricRef.current;
    const object = canvas?.getObjects().find((candidate) => dataOf(candidate).id === id);
    if (!canvas || !object) return;
    if (direction === "front") callFabricOrder(object, "bringToFront");
    if (direction === "back") callFabricOrder(object, "sendToBack");
    if (direction === "up") callFabricOrder(object, "bringForward");
    if (direction === "down") callFabricOrder(object, "sendBackwards");
    drawGuides();
    refreshLayers();
    saveHistory();
  };

  const updateLayer = (layerId: string, patch: Partial<Layer>) => {
    const canvas = fabricRef.current;
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)),
    );
    if (!canvas) return;
    canvas.getObjects().forEach((object) => {
      const data = dataOf(object);
      if (data.layerId !== layerId) return;
      if (patch.visible !== undefined) object.set({ visible: patch.visible });
      if (patch.locked !== undefined) setObjectLock(object, patch.locked);
      if (patch.opacity !== undefined) object.set({ opacity: patch.opacity });
    });
    canvas.requestRenderAll();
    refreshLayers();
    saveHistory();
    updateMiniMap();
  };

  function exportPNG() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "planta-baixa.png";
    a.click();
    toast.success("PNG exportado");
  }

  function exportPDF() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [CANVAS_W, CANVAS_H] });
    pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS_W, CANVAS_H);
    pdf.save("planta-baixa.pdf");
    toast.success("PDF exportado");
  }

  const lockSelected = () => {
    if (!selectedObject) return;
    setObjectLock(selectedObject, !dataOf(selectedObject).locked);
    fabricRef.current?.discardActiveObject();
    refreshLayers();
    saveHistory();
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100">
      <Toaster position="top-right" />

      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500 text-slate-950">
            <Map className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide">Auto Planta IA Editor</h1>
            <p className="text-[11px] text-slate-400">
              Editor vetorial de planta, objetos e croquis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium hover:bg-slate-800"
          >
            <ImageUp className="h-4 w-4" />
            {imageFile ? imageFile.name.slice(0, 24) : "Imagem"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          <Button
            size="sm"
            onClick={generate}
            disabled={!imageFile || loading}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            IA
          </Button>
          <Button size="sm" variant="secondary" onClick={saveHistory}>
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
          <Button size="sm" variant="secondary" disabled={!generated} onClick={exportPNG}>
            <FileImage className="mr-2 h-4 w-4" />
            PNG
          </Button>
          <Button size="sm" variant="secondary" disabled={!generated} onClick={exportPDF}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-800 bg-slate-950 py-3">
          {TOOL_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                title={item.label}
                onClick={() => setCanvasTool(item.id)}
                className={`flex h-10 w-10 items-center justify-center rounded-md border transition ${
                  tool === item.id
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"
                }`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden bg-slate-900">
          {showRulers && (
            <>
              <div className="absolute left-8 right-0 top-0 z-10 h-8 border-b border-slate-700 bg-slate-900/95 bg-[linear-gradient(to_right,rgba(148,163,184,.45)_1px,transparent_1px)] bg-[length:100px_8px]" />
              <div className="absolute bottom-0 left-0 top-8 z-10 w-8 border-r border-slate-700 bg-slate-900/95 bg-[linear-gradient(to_bottom,rgba(148,163,184,.45)_1px,transparent_1px)] bg-[length:8px_100px]" />
            </>
          )}
          <div className="absolute left-4 top-10 z-20 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-xs">
            <span>{Math.round(zoom * 100)}%</span>
            <button className="rounded px-2 py-1 hover:bg-slate-800" onClick={centerCanvas}>
              Centralizar
            </button>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(event) => setSnapToGrid(event.target.checked)}
              />
              Snap
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(event) => setShowGrid(event.target.checked)}
              />
              Grid
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={showRulers}
                onChange={(event) => setShowRulers(event.target.checked)}
              />
              Regua
            </label>
          </div>

          <div className="h-full overflow-auto p-12">
            <div className="mx-auto w-fit rounded-md border border-slate-700 bg-white shadow-2xl shadow-black/40">
              <canvas ref={canvasElRef} width={CANVAS_W} height={CANVAS_H} />
            </div>
          </div>

          <div className="absolute bottom-4 right-4 z-20 rounded-md border border-slate-700 bg-slate-950 p-2">
            <canvas ref={miniCanvasRef} width={180} height={116} className="block" />
          </div>

          {imageUrl && (
            <div className="absolute bottom-4 left-4 z-20 w-44 overflow-hidden rounded-md border border-slate-700 bg-slate-950 p-2">
              <img src={imageUrl} alt="Original" className="max-h-28 w-full object-contain" />
            </div>
          )}
        </main>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Propriedades</h2>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedObject}
                  onClick={duplicateSelection}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" disabled={!selectedObject} onClick={lockSelected}>
                  {selectedData?.locked ? (
                    <Unlock className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedObject}
                  onClick={deleteSelection}
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            </div>

            {!selectedObject || !selectedData || !selectedBounds ? (
              <p className="rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                Selecione qualquer item no canvas para editar nome, tipo, posicao, cor, borda,
                opacidade, camada e confidence.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <label className="block">
                  <span className="mb-1 block text-slate-400">Nome</span>
                  <input
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2"
                    value={selectedData.name}
                    onChange={(event) => updateSelected({ name: event.target.value })}
                    onBlur={commitSelected}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <ReadOnly label="Tipo" value={selectedData.type} />
                  <ReadOnly
                    label="Confidence"
                    value={
                      selectedData.confidence === undefined
                        ? "-"
                        : `${Math.round(selectedData.confidence * 100)}%`
                    }
                  />
                  <NumberInput
                    label="X"
                    value={selectedBounds.x}
                    onChange={(value) => updateSelected({ x: value })}
                    onBlur={commitSelected}
                  />
                  <NumberInput
                    label="Y"
                    value={selectedBounds.y}
                    onChange={(value) => updateSelected({ y: value })}
                    onBlur={commitSelected}
                  />
                  <NumberInput
                    label="Largura"
                    value={selectedBounds.width}
                    onChange={(value) => updateSelected({ width: Math.max(1, value) })}
                    onBlur={commitSelected}
                  />
                  <NumberInput
                    label="Altura"
                    value={selectedBounds.height}
                    onChange={(value) => updateSelected({ height: Math.max(1, value) })}
                    onBlur={commitSelected}
                  />
                  <NumberInput
                    label="Rotacao"
                    value={selectedBounds.rotation}
                    onChange={(value) => updateSelected({ rotation: value })}
                    onBlur={commitSelected}
                  />
                  <NumberInput
                    label="Opacidade"
                    value={Math.round((selectedObject.opacity ?? 1) * 100)}
                    onChange={(value) =>
                      updateSelected({ opacity: Math.max(0, Math.min(1, value / 100)) })
                    }
                    onBlur={commitSelected}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ColorInput
                    label="Cor"
                    value={fillColor}
                    onChange={(value) => {
                      setFillColor(value);
                      updateSelected({ fill: value });
                    }}
                    onBlur={commitSelected}
                  />
                  <ColorInput
                    label="Borda"
                    value={strokeColor}
                    onChange={(value) => {
                      setStrokeColor(value);
                      updateSelected({ stroke: value });
                    }}
                    onBlur={commitSelected}
                  />
                </div>
                <label className="block">
                  <span className="mb-1 block text-slate-400">Camada</span>
                  <select
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2"
                    value={selectedData.layerId}
                    onChange={(event) => {
                      setObjectData(selectedObject, {
                        ...selectedData,
                        layerId: event.target.value,
                      });
                      refreshLayers();
                      saveHistory();
                    }}
                  >
                    {layers.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="border-b border-slate-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4" /> Camadas
              </h2>
              <button
                className="text-xs text-cyan-300"
                onClick={() => {
                  const id = makeId("layer");
                  setLayers((prev) => [
                    ...prev,
                    {
                      id,
                      name: `Camada ${prev.length + 1}`,
                      visible: true,
                      locked: false,
                      opacity: 1,
                    },
                  ]);
                  setActiveLayerId(id);
                }}
              >
                Nova
              </button>
            </div>
            <div className="space-y-2">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`rounded-md border p-2 ${activeLayerId === layer.id ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-900"}`}
                >
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>
                      {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button onClick={() => updateLayer(layer.id, { locked: !layer.locked })}>
                      {layer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                    <button
                      className="flex-1 truncate text-left text-xs font-medium"
                      onClick={() => setActiveLayerId(layer.id)}
                    >
                      {layer.name}
                    </button>
                    <span className="text-[10px] text-slate-500">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(layer.opacity * 100)}
                    onChange={(event) =>
                      updateLayer(layer.id, { opacity: Number(event.target.value) / 100 })
                    }
                    className="mt-2 w-full"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Objetos</h2>
              <button
                className="flex items-center gap-1 text-xs text-cyan-300"
                onClick={() => selectedData && moveObject(selectedData.id, "front")}
              >
                <BringToFront className="h-3 w-3" /> Frente
              </button>
            </div>
            <div className="space-y-1.5">
              {layerRows.map((row) => (
                <div
                  key={row.id}
                  className="group rounded-md border border-slate-800 bg-slate-900 p-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleLayerObject(row.id, "visible")}>
                      {row.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button onClick={() => toggleLayerObject(row.id, "locked")}>
                      {row.locked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() => {
                        const object = fabricRef.current
                          ?.getObjects()
                          .find((candidate) => dataOf(candidate).id === row.id);
                        if (object) {
                          fabricRef.current?.setActiveObject(object);
                          setSelectedObject(object);
                          fabricRef.current?.requestRenderAll();
                        }
                      }}
                    >
                      {row.name}
                    </button>
                    <button onClick={() => moveObject(row.id, "up")}>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 pl-14 text-[10px] uppercase tracking-wide text-slate-500">
                    {row.type}
                  </p>
                </div>
              ))}
              {layerRows.length === 0 && (
                <p className="text-xs text-slate-500">Nenhum objeto ainda.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-slate-400">{label}</span>
      <div className="flex h-9 items-center rounded-md border border-slate-800 bg-slate-900 px-2 text-slate-300">
        {value}
      </div>
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBlur: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-slate-400">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={onBlur}
      />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-slate-400">
        <Palette className="h-3 w-3" /> {label}
      </span>
      <input
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 p-1"
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
