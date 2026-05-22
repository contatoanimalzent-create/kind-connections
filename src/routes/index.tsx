import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import jsPDF from "jspdf";
import { Upload, Sparkles, Download, FileImage, Loader2, Map as MapIcon, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { renderFloorPlanLayered } from "@/lib/floorplan-render";
import type { FloorPlanData, LayerVisibility, RenderMode } from "@/lib/floorplan-types";
import { ObjectSidebar } from "@/components/ObjectSidebar";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Auto Planta IA — Gere plantas baixas de eventos automaticamente" },
      {
        name: "description",
        content:
          "Transforme mapas e imagens de eventos em plantas baixas limpas e editáveis com IA. Exporte em PNG e PDF.",
      },
    ],
  }),
});

const CANVAS_W = 1200;
const CANVAS_H = 820;

const DEFAULT_VIS: LayerVisibility = {
  background_reference: true,
  boundaries: true,
  zones: true,
  icons: true,
  texts: true,
  legend: true,
};

function Index() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [data, setData] = useState<FloorPlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [mode, setMode] = useState<RenderMode>("high_fidelity");
  const [visibility, setVisibility] = useState<LayerVisibility>(DEFAULT_VIS);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
      if (e.key.toLowerCase() === "f" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        setFocusMode((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // init fabric
  useEffect(() => {
    if (!canvasElRef.current) return;
    const c = new fabric.Canvas(canvasElRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#fafafa",
      preserveObjectStacking: true,
    });
    fabricRef.current = c;
    return () => {
      c.dispose();
      fabricRef.current = null;
    };
  }, []);

  // re-render when data / mode / visibility changes
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !data) return;
    renderFloorPlanLayered(c, data, mode, visibility);
  }, [data, mode, visibility]);

  const handleFile = (file: File) => {
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setGenerated(false);
    setData(null);
    fabricRef.current?.clear();
    fabricRef.current?.set({ backgroundColor: "#fafafa" });
    fabricRef.current?.requestRenderAll();
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  };

  const generate = useCallback(async () => {
    if (!imageFile) {
      toast.error("Faça upload de uma imagem primeiro");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", imageFile);
      const res = await fetch("/api/analyze-image", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Falha na análise");
      const json = (await res.json()) as { data: FloorPlanData; fallback?: boolean };
      const withImage: FloorPlanData = { ...json.data, imageUrl: imageUrl ?? undefined };
      setData(withImage);
      setGenerated(true);
      const counts = withImage.layers;
      const total =
        counts.boundaries.length + counts.zones.length + counts.icons.length + counts.texts.length + counts.legend.length;
      if (json.fallback) toast.warning("IA indisponível — mostrando exemplo");
      else
        toast.success(
          `${total} elementos: ${counts.icons.length} ícones, ${counts.texts.length} textos, ${counts.zones.length} áreas, ${counts.boundaries.length} linhas`,
        );
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar planta baixa");
    } finally {
      setLoading(false);
    }
  }, [imageFile, imageUrl]);

  const handleDeleteIcon = (id: string) =>
    setData((d) => (d ? { ...d, layers: { ...d.layers, icons: d.layers.icons.filter((o) => o.id !== id) } } : d));
  const handleDeleteText = (id: string) =>
    setData((d) => (d ? { ...d, layers: { ...d.layers, texts: d.layers.texts.filter((o) => o.id !== id) } } : d));

  const exportPNG = () => {
    const c = fabricRef.current;
    if (!c) return;
    c.discardActiveObject();
    c.requestRenderAll();
    const dataUrl = c.toDataURL({ format: "png", multiplier: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "planta-baixa.png";
    a.click();
    toast.success("PNG exportado");
  };

  const exportPDF = () => {
    const c = fabricRef.current;
    if (!c) return;
    c.discardActiveObject();
    c.requestRenderAll();
    const dataUrl = c.toDataURL({ format: "png", multiplier: 2 });
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [CANVAS_W, CANVAS_H] });
    pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS_W, CANVAS_H);
    pdf.save("planta-baixa.pdf");
    toast.success("PDF exportado");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Toaster position="top-right" />

      {!focusMode && (
        <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MapIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Auto Planta IA</h1>
              <p className="text-xs text-muted-foreground">Plantas baixas por camadas — máxima fidelidade</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!generated} onClick={() => setFocusMode(true)}>
              <Maximize2 className="h-4 w-4 mr-1.5" /> Tela cheia
            </Button>
            <Button variant="outline" size="sm" disabled={!generated} onClick={exportPNG}>
              <FileImage className="h-4 w-4 mr-1.5" /> PNG
            </Button>
            <Button variant="outline" size="sm" disabled={!generated} onClick={exportPDF}>
              <Download className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          </div>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {!focusMode && (
          <aside className="w-72 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border space-y-3">
              <h2 className="text-sm font-semibold text-foreground">1. Imagem original</h2>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-background px-4 py-5 cursor-pointer hover:border-primary/50 hover:bg-accent transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground text-center">
                  Arraste uma imagem ou clique
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={onInputChange} />
              </label>
              <Button className="w-full" onClick={generate} disabled={!imageFile || loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Gerar planta baixa
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                A IA preserva textos, cores, linhas e ícones em camadas separadas.
              </p>
            </div>

            {imageUrl && (
              <div className="p-4 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
                <div className="rounded-md overflow-hidden border border-border bg-muted">
                  <img src={imageUrl} alt="Original" className="w-full h-auto" />
                </div>
              </div>
            )}
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="mx-auto rounded-lg border border-border bg-white shadow-sm" style={{ width: CANVAS_W }}>
            {!focusMode && (
              <div className="border-b border-border px-4 py-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Planta baixa — {mode === "high_fidelity" ? "Alta fidelidade" : "Planta limpa"}
                </p>
                {generated && (
                  <p className="text-[11px] text-muted-foreground">
                    Alterne camadas e modo na lateral direita
                  </p>
                )}
              </div>
            )}
            <canvas ref={canvasElRef} width={CANVAS_W} height={CANVAS_H} />
          </div>
        </main>

        {!focusMode && (
          <ObjectSidebar
            data={data}
            mode={mode}
            onModeChange={setMode}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            onDeleteIcon={handleDeleteIcon}
            onDeleteText={handleDeleteText}
          />
        )}

        {focusMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFocusMode(false)}
            className="absolute top-4 right-4 z-10 shadow-md"
          >
            <Minimize2 className="h-4 w-4 mr-1.5" /> Sair da tela cheia (Esc)
          </Button>
        )}
      </div>
    </div>
  );
}
