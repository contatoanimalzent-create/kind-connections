import * as fabric from "fabric";
import jsPDF from "jspdf";
import { contentBounds } from "./objectUtils";

const FALLBACK = { left: 0, top: 0, width: 1400, height: 900 };
const PADDING = 40;

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Region (scene coords) that wraps all content with padding - falls back to a default page. */
function exportRegion(canvas: fabric.Canvas) {
  const bounds = contentBounds(canvas) ?? FALLBACK;
  return {
    left: bounds.left - PADDING,
    top: bounds.top - PADDING,
    width: Math.max(1, bounds.width + PADDING * 2),
    height: Math.max(1, bounds.height + PADDING * 2),
  };
}

export function exportPNG(canvas: fabric.Canvas, filename = "planta-baixa.png") {
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const region = exportRegion(canvas);
  const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2, ...region });
  downloadDataUrl(dataUrl, filename);
}

export function exportPDF(canvas: fabric.Canvas, filename = "planta-baixa.pdf") {
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const region = exportRegion(canvas);
  const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2, ...region });
  const orientation = region.width >= region.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [region.width, region.height] });
  pdf.addImage(dataUrl, "PNG", 0, 0, region.width, region.height);
  pdf.save(filename);
}

export function exportSVG(canvas: fabric.Canvas, filename = "planta-baixa.svg") {
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const region = exportRegion(canvas);
  const svg = canvas.toSVG({
    width: `${Math.round(region.width)}`,
    height: `${Math.round(region.height)}`,
    viewBox: {
      x: region.left,
      y: region.top,
      width: region.width,
      height: region.height,
    },
  });
  downloadText(svg, filename, "image/svg+xml");
}

export type ProjectFile = {
  app: "auto-planta-ia";
  version: number;
  savedAt: string;
  canvas: ReturnType<fabric.Canvas["toJSON"]>;
};

/** Serializes the full editable scene (objects + metadata) as a project file. */
export function exportProjectJSON(canvas: fabric.Canvas, filename = "projeto-planta.json") {
  const project: ProjectFile = {
    app: "auto-planta-ia",
    version: 1,
    savedAt: new Date().toISOString(),
    canvas: (canvas.toJSON as (props?: string[]) => ProjectFile["canvas"])([
      "data",
      "selectable",
      "evented",
      "excludeFromExport",
    ]),
  };
  downloadText(JSON.stringify(project, null, 2), filename, "application/json");
}

/** Loads a previously exported project file back into the canvas. */
export async function importProjectJSON(canvas: fabric.Canvas, text: string): Promise<void> {
  const parsed = JSON.parse(text) as Partial<ProjectFile> & {
    objects?: unknown;
  };
  const scene = parsed.canvas ?? parsed;
  await canvas.loadFromJSON(scene);
  canvas.requestRenderAll();
}
