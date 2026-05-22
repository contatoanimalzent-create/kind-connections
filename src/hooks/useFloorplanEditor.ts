import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as fabric from "fabric";
import { toast } from "sonner";
import {
  DEFAULT_LAYER_ID,
  buildFabricObject,
  makeId,
  renderFloorPlan,
  setObjectData,
  type AnalysisResult,
  type Detected,
  type DetectedType,
  type EditableData,
} from "@/lib/floorplan-render";
import { GRID, type Layer, type LayerRow, type Tool } from "@/lib/floorplan/types";
import {
  applyEditorControls,
  callFabricOrder,
  contentBounds,
  dataOf,
  objectBounds,
  setObjectLock,
  setPaint,
  snap,
} from "@/lib/floorplan/objectUtils";
import {
  exportPDF as exportPdfFile,
  exportPNG as exportPngFile,
  exportProjectJSON,
  exportSVG as exportSvgFile,
  importProjectJSON,
} from "@/lib/floorplan/export";
import type { Volume } from "@/lib/floorplan/three3d";

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

type Viewport = { zoom: number; x: number; y: number };

export function useFloorplanEditor() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const [layers, setLayers] = useState<Layer[]>([
    { id: DEFAULT_LAYER_ID, name: "Objetos", visible: true, locked: false, opacity: 1 },
    { id: "notes", name: "Anotacoes", visible: true, locked: false, opacity: 1 },
  ]);
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER_ID);
  const [layerRows, setLayerRows] = useState<LayerRow[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [fillColor, setFillColor] = useState("#ffffff");
  const [strokeColor, setStrokeColor] = useState("#111827");
  const [opacity, setOpacity] = useState(1);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });

  const selectedData = selectedObject ? dataOf(selectedObject) : null;
  const selectedBounds = selectedObject ? objectBounds(selectedObject) : null;

  useEffect(() => {
    toolRef.current = tool;
    activeLayerRef.current = activeLayerId;
    snapRef.current = snapToGrid;
    fillRef.current = fillColor;
    strokeRef.current = strokeColor;
    opacityRef.current = opacity;
  }, [activeLayerId, fillColor, opacity, snapToGrid, strokeColor, tool]);

  const syncViewport = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    setViewport({ zoom: canvas.getZoom(), x: vpt[4], y: vpt[5] });
  }, []);

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
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || restoringRef.current) return;
    const json = JSON.stringify(
      (canvas.toJSON as (props?: string[]) => unknown)(["data", "selectable", "evented"]),
    );
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
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, mini.width, mini.height);

    const bounds = contentBounds(canvas);
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    const z = canvas.getZoom();
    const viewLeft = -vpt[4] / z;
    const viewTop = -vpt[5] / z;
    const viewW = canvas.getWidth() / z;
    const viewH = canvas.getHeight() / z;

    const region = bounds
      ? {
          left: Math.min(bounds.left, viewLeft) - 50,
          top: Math.min(bounds.top, viewTop) - 50,
          right: Math.max(bounds.left + bounds.width, viewLeft + viewW) + 50,
          bottom: Math.max(bounds.top + bounds.height, viewTop + viewH) + 50,
        }
      : { left: viewLeft, top: viewTop, right: viewLeft + viewW, bottom: viewTop + viewH };
    const rw = Math.max(1, region.right - region.left);
    const rh = Math.max(1, region.bottom - region.top);
    const scale = Math.min(mini.width / rw, mini.height / rh);
    const offX = (mini.width - rw * scale) / 2;
    const offY = (mini.height - rh * scale) / 2;
    const mapX = (x: number) => offX + (x - region.left) * scale;
    const mapY = (y: number) => offY + (y - region.top) * scale;

    for (const object of canvas.getObjects()) {
      const data = dataOf(object);
      if (data.layerId === "guides" || object.visible === false) continue;
      const b = object.getBoundingRect();
      ctx.fillStyle = data.type === "area" ? "rgba(20,184,166,.4)" : "rgba(56,189,248,.6)";
      ctx.fillRect(mapX(b.left), mapY(b.top), Math.max(2, b.width * scale), Math.max(2, b.height * scale));
    }
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mapX(viewLeft), mapY(viewTop), viewW * scale, viewH * scale);
  }, []);

  const afterMutation = useCallback(() => {
    refreshLayers();
    saveHistory();
    updateMiniMap();
  }, [refreshLayers, saveHistory, updateMiniMap]);

  const fitView = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const bounds = contentBounds(canvas);
    if (!bounds) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    } else {
      const pad = 80;
      const zoom = Math.min(
        canvas.getWidth() / (bounds.width + pad * 2),
        canvas.getHeight() / (bounds.height + pad * 2),
        2,
      );
      const z = Math.max(0.1, zoom);
      const x = -(bounds.left - pad) * z + (canvas.getWidth() - (bounds.width + pad * 2) * z) / 2;
      const y = -(bounds.top - pad) * z + (canvas.getHeight() - (bounds.height + pad * 2) * z) / 2;
      canvas.setViewportTransform([z, 0, 0, z, x, y]);
    }
    canvas.requestRenderAll();
    syncViewport();
    updateMiniMap();
  }, [syncViewport, updateMiniMap]);

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
      afterMutation();
    },
    [afterMutation],
  );

  const addObjectByType = useCallback(
    (type: DetectedType) => {
      const canvas = fabricRef.current;
      const center = canvas
        ? canvas.getVpCenter?.() ?? new fabric.Point(280, 220)
        : new fabric.Point(280, 220);
      const detected: Detected = {
        id: makeId(type),
        type,
        label: FALLBACK_LABEL[type],
        x: Math.round(center.x - 60),
        y: Math.round(center.y - 40),
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
    canvas.getActiveObjects().forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    setSelectedObject(null);
    afterMutation();
  }, [afterMutation]);

  const duplicateSelection = useCallback(async () => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    const clone = await active.clone(["data"]);
    const data = dataOf(active);
    clone.set({ left: (active.left ?? 0) + 24, top: (active.top ?? 0) + 24 });
    applyEditorControls(clone);
    setObjectData(clone, { ...data, id: makeId(data.type), name: `${data.name} copia` });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    setSelectedObject(clone);
    canvas.requestRenderAll();
    afterMutation();
  }, [afterMutation]);

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

  // ---- Canvas bootstrap ----
  useEffect(() => {
    if (!canvasElRef.current) return;
    const host = containerRef.current;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: host?.clientWidth || 1200,
      height: host?.clientHeight || 800,
      backgroundColor: "#ffffff",
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
      afterMutation();
    });
    canvas.on("path:created", (event) => {
      const path = (event as unknown as { path?: fabric.Object }).path;
      if (!path) return;
      applyEditorControls(path);
      setObjectData(path, {
        id: makeId("freehand"),
        name: "Croqui",
        type: "freehand",
        layerId: activeLayerRef.current,
      });
      afterMutation();
    });
    canvas.on("mouse:wheel", (opt) => {
      const event = opt.e as WheelEvent;
      let nextZoom = canvas.getZoom() * 0.999 ** event.deltaY;
      nextZoom = Math.min(10, Math.max(0.05, nextZoom));
      canvas.zoomToPoint(new fabric.Point(event.offsetX, event.offsetY), nextZoom);
      event.preventDefault();
      event.stopPropagation();
      syncViewport();
      updateMiniMap();
    });
    canvas.on("mouse:down", (opt) => {
      const pointer = canvas.getScenePoint(opt.e);
      const currentTool = toolRef.current;
      const mouseEvent = opt.e as MouseEvent;
      if (currentTool === "hand" || spaceDownRef.current) {
        drawingRef.current = {
          startX: pointer.x,
          startY: pointer.y,
          isDraggingViewport: true,
          lastX: mouseEvent.clientX,
          lastY: mouseEvent.clientY,
        };
        canvas.defaultCursor = "grabbing";
        return;
      }
      if (currentTool === "eraser" && opt.target) {
        canvas.remove(opt.target);
        afterMutation();
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
        if (polygonPointsRef.current.length >= 3 && (mouseEvent as MouseEvent).detail >= 2) {
          const points = polygonPointsRef.current;
          polygonPointsRef.current = [];
          addEditableObject(
            new fabric.Polygon(points, {
              fill: "rgba(37,99,235,0.12)",
              stroke: strokeRef.current,
              strokeWidth: 2,
            }),
            { id: makeId("polygon"), name: "Poligono", type: "polygon", layerId: activeLayerRef.current },
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
        const e = opt.e as MouseEvent;
        const vpt = canvas.viewportTransform;
        if (!vpt || draft.lastX === undefined || draft.lastY === undefined) return;
        vpt[4] += e.clientX - draft.lastX;
        vpt[5] += e.clientY - draft.lastY;
        draft.lastX = e.clientX;
        draft.lastY = e.clientY;
        canvas.requestRenderAll();
        syncViewport();
        updateMiniMap();
        return;
      }
      const pointer = canvas.getScenePoint(opt.e);
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
        const length = Math.hypot((object.x2 ?? 0) - (object.x1 ?? 0), (object.y2 ?? 0) - (object.y1 ?? 0));
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
        const dx = (object.x2 ?? 0) - x1;
        const dy = (object.y2 ?? 0) - y1;
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
        name: currentTool === "area" ? "Area" : currentTool === "line" ? "Linha" : "Retangulo",
        type: currentTool === "area" ? "area" : currentTool === "line" ? "line" : "rectangle",
        layerId: activeLayerRef.current,
      });
      canvas.setActiveObject(object);
      setSelectedObject(object);
      afterMutation();
    });

    saveHistory();
    syncViewport();
    updateMiniMap();

    // Responsive sizing -> infinite canvas fills its container.
    const resize = () => {
      const el = containerRef.current;
      if (!el) return;
      canvas.setDimensions({ width: el.clientWidth, height: el.clientHeight });
      canvas.requestRenderAll();
      syncViewport();
      updateMiniMap();
    };
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);
    resize();

    return () => {
      observer.disconnect();
      canvas.dispose();
      fabricRef.current = null;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        spaceDownRef.current = true;
        event.preventDefault();
      }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "d") {
          event.preventDefault();
          void duplicateSelection();
        } else if (key === "z") {
          event.preventDefault();
          undo();
        } else if (key === "y") {
          event.preventDefault();
          redo();
        } else if (key === "s") {
          event.preventDefault();
          saveHistory();
          toast.success("Estado salvo (undo/redo)");
        } else if (key === "e") {
          event.preventDefault();
          if (fabricRef.current) exportPngFile(fabricRef.current);
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

  // ---- File / AI ----
  const handleFile = useCallback((file: File) => {
    setImageFile(file);
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImageUrl(url);
    setGenerated(false);
  }, []);

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
      const canvas = fabricRef.current;
      if (canvas) {
        renderFloorPlan(canvas, data);
        canvas.getObjects().forEach(applyEditorControls);
      }
      setGenerated(true);
      afterMutation();
      fitView();
      toast.success(`${data.objects.length} objetos editaveis criados`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar planta baixa");
    } finally {
      setLoading(false);
    }
  }, [afterMutation, fitView, imageFile]);

  // ---- Selection / properties ----
  const updateSelected = useCallback(
    (
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
      if (patch.width !== undefined && object.width) object.set({ scaleX: patch.width / object.width });
      if (patch.height !== undefined && object.height) object.set({ scaleY: patch.height / object.height });
      if (patch.fill !== undefined || patch.stroke !== undefined)
        setPaint(object, { fill: patch.fill, stroke: patch.stroke });
      object.setCoords();
      canvas.requestRenderAll();
      refreshLayers();
      updateMiniMap();
    },
    [refreshLayers, selectedObject, updateMiniMap],
  );

  const commitSelected = useCallback(() => {
    saveHistory();
    refreshLayers();
  }, [refreshLayers, saveHistory]);

  const changeSelectedLayer = useCallback(
    (layerId: string) => {
      if (!selectedObject) return;
      setObjectData(selectedObject, { ...dataOf(selectedObject), layerId });
      refreshLayers();
      saveHistory();
    },
    [refreshLayers, saveHistory, selectedObject],
  );

  const lockSelected = useCallback(() => {
    if (!selectedObject) return;
    setObjectLock(selectedObject, !dataOf(selectedObject).locked);
    fabricRef.current?.discardActiveObject();
    refreshLayers();
    saveHistory();
  }, [refreshLayers, saveHistory, selectedObject]);

  const selectObjectById = useCallback((id: string) => {
    const canvas = fabricRef.current;
    const object = canvas?.getObjects().find((candidate) => dataOf(candidate).id === id);
    if (!canvas || !object) return;
    canvas.setActiveObject(object);
    setSelectedObject(object);
    canvas.requestRenderAll();
  }, []);

  const toggleLayerObject = useCallback(
    (id: string, key: "visible" | "locked") => {
      const canvas = fabricRef.current;
      const object = canvas?.getObjects().find((candidate) => dataOf(candidate).id === id);
      if (!canvas || !object) return;
      if (key === "visible") object.set({ visible: object.visible === false });
      if (key === "locked") setObjectLock(object, !dataOf(object).locked);
      canvas.requestRenderAll();
      afterMutation();
    },
    [afterMutation],
  );

  const moveObject = useCallback(
    (id: string, direction: "front" | "back" | "up" | "down") => {
      const canvas = fabricRef.current;
      const object = canvas?.getObjects().find((candidate) => dataOf(candidate).id === id);
      if (!canvas || !object) return;
      const method = (
        { front: "bringToFront", back: "sendToBack", up: "bringForward", down: "sendBackwards" } as const
      )[direction];
      callFabricOrder(object, method);
      afterMutation();
    },
    [afterMutation],
  );

  const addLayer = useCallback(() => {
    const id = makeId("layer");
    setLayers((prev) => [
      ...prev,
      { id, name: `Camada ${prev.length + 1}`, visible: true, locked: false, opacity: 1 },
    ]);
    setActiveLayerId(id);
  }, []);

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<Layer>) => {
      const canvas = fabricRef.current;
      setLayers((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)));
      if (!canvas) return;
      canvas.getObjects().forEach((object) => {
        if (dataOf(object).layerId !== layerId) return;
        if (patch.visible !== undefined) object.set({ visible: patch.visible });
        if (patch.locked !== undefined) setObjectLock(object, patch.locked);
        if (patch.opacity !== undefined) object.set({ opacity: patch.opacity });
      });
      canvas.requestRenderAll();
      afterMutation();
    },
    [afterMutation],
  );

  // ---- Export / import ----
  const exportPNG = useCallback(() => {
    if (fabricRef.current) {
      exportPngFile(fabricRef.current);
      toast.success("PNG exportado");
    }
  }, []);
  const exportPDF = useCallback(() => {
    if (fabricRef.current) {
      exportPdfFile(fabricRef.current);
      toast.success("PDF exportado");
    }
  }, []);
  const exportSVG = useCallback(() => {
    if (fabricRef.current) {
      exportSvgFile(fabricRef.current);
      toast.success("SVG exportado");
    }
  }, []);
  const exportJSON = useCallback(() => {
    if (fabricRef.current) {
      exportProjectJSON(fabricRef.current);
      toast.success("Projeto JSON exportado");
    }
  }, []);
  const importProject = useCallback(
    async (file: File) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      try {
        const text = await file.text();
        await importProjectJSON(canvas, text);
        canvas.getObjects().forEach(applyEditorControls);
        setGenerated(true);
        afterMutation();
        fitView();
        toast.success("Projeto importado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "JSON invalido");
      }
    },
    [afterMutation, fitView],
  );

  /** Builds the 2D->3D volume list from current canvas objects. */
  const getVolumes = useCallback((): Volume[] => {
    const canvas = fabricRef.current;
    if (!canvas) return [];
    return canvas
      .getObjects()
      .filter((object) => {
        const data = dataOf(object);
        return (
          data.layerId !== "guides" &&
          object.visible !== false &&
          data.type !== "text" &&
          data.type !== "note" &&
          data.type !== "measure" &&
          data.type !== "line" &&
          data.type !== "freehand"
        );
      })
      .map((object) => {
        const data = dataOf(object);
        const b = objectBounds(object);
        const fill = (object.get("fill") as string) || "#3b82f6";
        return {
          id: data.id,
          type: data.type,
          label: data.name,
          x: b.x,
          y: b.y,
          width: Math.max(2, b.width),
          height: Math.max(2, b.height),
          rotation: b.rotation,
          color: typeof fill === "string" ? fill : "#3b82f6",
        };
      });
  }, []);

  // ---- Infinite grid (CSS background that tracks the viewport) ----
  const gridStyle = useMemo<CSSProperties | undefined>(() => {
    if (!showGrid) return undefined;
    const size = GRID * viewport.zoom;
    const major = size * 5;
    return {
      backgroundColor: "#ffffff",
      backgroundImage: [
        "linear-gradient(to right, #eef2f7 1px, transparent 1px)",
        "linear-gradient(to bottom, #eef2f7 1px, transparent 1px)",
        "linear-gradient(to right, #dbe4ef 1px, transparent 1px)",
        "linear-gradient(to bottom, #dbe4ef 1px, transparent 1px)",
      ].join(","),
      backgroundSize: `${size}px ${size}px, ${size}px ${size}px, ${major}px ${major}px, ${major}px ${major}px`,
      backgroundPosition: `${viewport.x}px ${viewport.y}px`,
    };
  }, [showGrid, viewport.x, viewport.y, viewport.zoom]);

  const rulerStyle = useMemo(() => {
    const size = 100 * viewport.zoom;
    return {
      horizontal: {
        backgroundSize: `${size}px 8px`,
        backgroundPositionX: `${viewport.x}px`,
      } as CSSProperties,
      vertical: {
        backgroundSize: `8px ${size}px`,
        backgroundPositionY: `${viewport.y}px`,
      } as CSSProperties,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  return {
    // refs
    canvasElRef,
    containerRef,
    miniCanvasRef,
    // state
    tool,
    imageUrl,
    imageFile,
    layers,
    activeLayerId,
    layerRows,
    selectedObject,
    selectedData,
    selectedBounds,
    loading,
    generated,
    zoom: viewport.zoom,
    snapToGrid,
    showGrid,
    showRulers,
    fillColor,
    strokeColor,
    gridStyle,
    rulerStyle,
    // setters
    setActiveLayerId,
    setSnapToGrid,
    setShowGrid,
    setShowRulers,
    setFillColor,
    setStrokeColor,
    // actions
    setCanvasTool,
    addObjectByType,
    deleteSelection,
    duplicateSelection,
    lockSelected,
    undo,
    redo,
    saveHistory,
    fitView,
    generate,
    handleFile,
    updateSelected,
    commitSelected,
    changeSelectedLayer,
    selectObjectById,
    toggleLayerObject,
    moveObject,
    addLayer,
    updateLayer,
    exportPNG,
    exportPDF,
    exportSVG,
    exportJSON,
    importProject,
    getVolumes,
  };
}

export type FloorplanEditor = ReturnType<typeof useFloorplanEditor>;
