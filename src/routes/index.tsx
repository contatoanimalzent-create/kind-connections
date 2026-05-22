import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import jsPDF from "jspdf";
import { Upload, Sparkles, Download, FileImage, Loader2, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  renderFloorPlan,
  buildFabricObject,
  type Detected,
} from "@/lib/floorplan-render";
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

const CANVAS_W = 1000;
const CANVAS_H = 680;

function Index() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [objects, setObjects] = useState<Detected[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

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

    c.on("selection:created", (e) => {
      const obj = e.selected?.[0] as (fabric.Object & { data?: { id?: string } }) | undefined;
      if (obj?.data?.id) setSelectedId(obj.data.id);
    });
    c.on("selection:updated", (e) => {
      const obj = e.selected?.[0] as (fabric.Object & { data?: { id?: string } }) | undefined;
      if (obj?.data?.id) setSelectedId(obj.data.id);
    });
    c.on("selection:cleared", () => setSelectedId(null));

    return () => {
      c.dispose();
      fabricRef.current = null;
    };
  }, []);

  const handleFile = (file: File) => {
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setGenerated(false);
    setObjects([]);
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
      const data = (await res.json()) as { objects: Detected[] };
      setObjects(data.objects);
      if (fabricRef.current) {
        renderFloorPlan(fabricRef.current, data.objects);
      }
      setGenerated(true);
      toast.success(`${data.objects.length} objetos detectados`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar planta baixa");
    } finally {
      setLoading(false);
    }
  }, [imageFile]);

  const findFabricById = (id: string) => {
    const c = fabricRef.current;
    if (!c) return undefined;
    return c.getObjects().find((o) => {
      const d = (o as fabric.Object & { data?: { id?: string } }).data;
      return d?.id === id;
    });
  };

  const handleSelect = (id: string) => {
    const obj = findFabricById(id);
    const c = fabricRef.current;
    if (obj && c) {
      c.setActiveObject(obj);
      c.requestRenderAll();
      setSelectedId(id);
    }
  };

  const handleDelete = (id: string) => {
    const obj = findFabricById(id);
    const c = fabricRef.current;
    if (obj && c) {
      c.remove(obj);
      c.requestRenderAll();
    }
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleRename = (id: string) => {
    const current = objects.find((o) => o.id === id);
    if (!current) return;
    const next = window.prompt("Novo nome:", current.label);
    if (!next) return;
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, label: next } : o)));
    const obj = findFabricById(id) as (fabric.Group & { data?: { label?: string } }) | undefined;
    if (obj?.data) obj.data.label = next;
  };

  const handleAdd = (type: string) => {
    const id = `${type}-${Date.now()}`;
    const newObj: Detected = {
      id,
      type,
      label:
        type === "texto"
          ? "Novo texto"
          : type.replace("_", " ").replace(/^./, (s) => s.toUpperCase()),
      x: 200,
      y: 200,
      width: type === "extintor" ? 28 : type === "texto" ? 120 : 100,
      height: type === "extintor" ? 28 : type === "texto" ? 20 : 70,
      confidence: 1,
      text: type === "texto" ? "Novo texto" : undefined,
    };
    setObjects((prev) => [...prev, newObj]);
    const c = fabricRef.current;
    if (c) {
      c.add(buildFabricObject(newObj));
      c.requestRenderAll();
    }
  };

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

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MapIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Auto Planta IA</h1>
            <p className="text-xs text-muted-foreground">
              Imagens de eventos → plantas baixas editáveis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!generated} onClick={exportPNG}>
            <FileImage className="h-4 w-4 mr-1.5" /> PNG
          </Button>
          <Button variant="outline" size="sm" disabled={!generated} onClick={exportPDF}>
            <Download className="h-4 w-4 mr-1.5" /> PDF
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: upload + preview */}
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
            <Button
              className="w-full"
              onClick={generate}
              disabled={!imageFile || loading}
            >
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
              A IA identifica palco, tendas, food trucks, banheiros, saídas, extintores e mais.
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

        {/* Canvas */}
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="mx-auto rounded-lg border border-border bg-white shadow-sm" style={{ width: CANVAS_W }}>
            <div className="border-b border-border px-4 py-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Planta baixa</p>
              {generated && (
                <p className="text-[11px] text-muted-foreground">
                  Clique nos objetos para mover, redimensionar ou rotacionar
                </p>
              )}
            </div>
            <canvas ref={canvasElRef} width={CANVAS_W} height={CANVAS_H} />
          </div>
        </main>

        {/* Right sidebar */}
        <ObjectSidebar
          objects={objects}
          selectedId={selectedId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onRename={handleRename}
          onAdd={handleAdd}
        />
      </div>
    </div>
  );
}
