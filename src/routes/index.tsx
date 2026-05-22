import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type DragEvent } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useFloorplanEditor } from "@/hooks/useFloorplanEditor";
import { Topbar } from "@/components/editor/Topbar";
import { Toolbar } from "@/components/editor/Toolbar";
import { RightPanel } from "@/components/editor/RightPanel";
import { Viewer3D } from "@/components/editor/Viewer3D";
import type { Volume } from "@/lib/floorplan/three3d";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Auto Planta IA - Editor profissional de plantas" },
      {
        name: "description",
        content:
          "Transforme imagens em plantas editaveis com IA e refine tudo em um editor estilo Figma/Canva/Floorplanner com visualizacao 3D.",
      },
    ],
  }),
});

function Index() {
  const editor = useFloorplanEditor();
  const [show3D, setShow3D] = useState(false);
  const [volumes, setVolumes] = useState<Volume[]>([]);

  const open3D = () => {
    setVolumes(editor.getVolumes());
    setShow3D(true);
  };

  const onCanvasDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) editor.handleFile(file);
  };

  const zoomPct = useMemo(() => Math.round(editor.zoom * 100), [editor.zoom]);

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100">
      <Toaster position="top-right" />

      <Topbar
        imageFile={editor.imageFile}
        loading={editor.loading}
        generated={editor.generated}
        onFile={editor.handleFile}
        onGenerate={editor.generate}
        onSave={() => editor.saveHistory()}
        onExportPNG={editor.exportPNG}
        onExportPDF={editor.exportPDF}
        onExportSVG={editor.exportSVG}
        onExportJSON={editor.exportJSON}
        onImportProject={editor.importProject}
        onOpen3D={open3D}
      />

      <div className="flex min-h-0 flex-1">
        <Toolbar tool={editor.tool} onSelect={editor.setCanvasTool} />

        <main className="relative min-w-0 flex-1 overflow-hidden bg-slate-900">
          {editor.showRulers && (
            <>
              <div
                className="pointer-events-none absolute left-8 right-0 top-0 z-10 h-8 border-b border-slate-700 bg-slate-900/95 bg-[linear-gradient(to_right,rgba(148,163,184,.45)_1px,transparent_1px)]"
                style={editor.rulerStyle.horizontal}
              />
              <div
                className="pointer-events-none absolute bottom-0 left-0 top-8 z-10 w-8 border-r border-slate-700 bg-slate-900/95 bg-[linear-gradient(to_bottom,rgba(148,163,184,.45)_1px,transparent_1px)]"
                style={editor.rulerStyle.vertical}
              />
            </>
          )}

          <div className="absolute left-12 top-10 z-20 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-xs">
            <span className="w-12 text-center tabular-nums">{zoomPct}%</span>
            <button className="rounded px-2 py-1 hover:bg-slate-800" onClick={editor.fitView}>
              Centralizar
            </button>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={editor.snapToGrid}
                onChange={(event) => editor.setSnapToGrid(event.target.checked)}
              />
              Snap
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={editor.showGrid}
                onChange={(event) => editor.setShowGrid(event.target.checked)}
              />
              Grid
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={editor.showRulers}
                onChange={(event) => editor.setShowRulers(event.target.checked)}
              />
              Regua
            </label>
          </div>

          {/* Infinite canvas surface */}
          <div
            ref={editor.containerRef}
            className="absolute inset-0"
            style={editor.gridStyle}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onCanvasDrop}
          >
            <canvas ref={editor.canvasElRef} />
          </div>

          {/* Mini map */}
          <div className="absolute bottom-4 right-4 z-20 rounded-md border border-slate-700 bg-slate-950 p-2">
            <canvas ref={editor.miniCanvasRef} width={180} height={116} className="block" />
          </div>

          {/* Original reference image */}
          {editor.imageUrl && (
            <div className="absolute bottom-4 left-4 z-20 w-44 overflow-hidden rounded-md border border-slate-700 bg-slate-950 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Referencia</p>
              <img src={editor.imageUrl} alt="Original" className="max-h-28 w-full object-contain" />
            </div>
          )}
        </main>

        <RightPanel editor={editor} />
      </div>

      <Viewer3D open={show3D} volumes={volumes} onClose={() => setShow3D(false)} />
    </div>
  );
}
