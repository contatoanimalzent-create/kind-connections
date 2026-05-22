import { useRef, type DragEvent } from "react";
import {
  Boxes,
  Code2,
  Download,
  FileImage,
  FileType2,
  ImageUp,
  Loader2,
  Map,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type TopbarProps = {
  imageFile: File | null;
  loading: boolean;
  generated: boolean;
  onFile: (file: File) => void;
  onGenerate: () => void;
  onSave: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  onImportProject: (file: File) => void;
  onOpen3D: () => void;
};

export function Topbar({
  imageFile,
  loading,
  generated,
  onFile,
  onGenerate,
  onSave,
  onExportPNG,
  onExportPDF,
  onExportSVG,
  onExportJSON,
  onImportProject,
  onOpen3D,
}: TopbarProps) {
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) onFile(file);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500 text-slate-950">
          <Map className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-wide">Auto Planta IA Editor</h1>
          <p className="text-[11px] text-slate-400">Editor vetorial de planta, objetos e croquis</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium hover:bg-slate-800"
        >
          <ImageUp className="h-4 w-4" />
          {imageFile ? imageFile.name.slice(0, 20) : "Imagem"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>

        <Button
          size="sm"
          onClick={onGenerate}
          disabled={!imageFile || loading}
          className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          IA
        </Button>

        <Button size="sm" variant="secondary" onClick={onOpen3D} disabled={!generated}>
          <Boxes className="mr-2 h-4 w-4" />
          3D
        </Button>

        <span className="mx-1 h-6 w-px bg-slate-800" />

        <Button size="sm" variant="secondary" onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          Salvar
        </Button>

        <button
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium hover:bg-slate-800"
          onClick={() => projectInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Abrir
          <input
            ref={projectInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportProject(file);
              event.target.value = "";
            }}
          />
        </button>

        <span className="mx-1 h-6 w-px bg-slate-800" />

        <Button size="sm" variant="secondary" disabled={!generated} onClick={onExportPNG} title="PNG">
          <FileImage className="mr-1.5 h-4 w-4" />
          PNG
        </Button>
        <Button size="sm" variant="secondary" disabled={!generated} onClick={onExportPDF} title="PDF">
          <Download className="mr-1.5 h-4 w-4" />
          PDF
        </Button>
        <Button size="sm" variant="secondary" disabled={!generated} onClick={onExportSVG} title="SVG">
          <FileType2 className="mr-1.5 h-4 w-4" />
          SVG
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportJSON} title="Projeto JSON">
          <Code2 className="mr-1.5 h-4 w-4" />
          JSON
        </Button>
      </div>
    </header>
  );
}
