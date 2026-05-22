import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { FloorPlanData, LayerVisibility, RenderMode } from "@/lib/floorplan-types";

interface Props {
  data: FloorPlanData | null;
  mode: RenderMode;
  onModeChange: (m: RenderMode) => void;
  visibility: LayerVisibility;
  onVisibilityChange: (v: LayerVisibility) => void;
  onDeleteIcon: (id: string) => void;
  onDeleteText: (id: string) => void;
}

function confColor(c: number) {
  if (c >= 0.85) return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
  if (c >= 0.6) return "bg-amber-500/10 text-amber-700 border-amber-200";
  return "bg-rose-500/10 text-rose-700 border-rose-200";
}

const LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: "background_reference", label: "Imagem original (fundo)" },
  { key: "zones", label: "Áreas coloridas" },
  { key: "boundaries", label: "Perímetros / linhas" },
  { key: "icons", label: "Ícones / estruturas" },
  { key: "texts", label: "Textos" },
  { key: "legend", label: "Legenda" },
];

export function ObjectSidebar({ data, mode, onModeChange, visibility, onVisibilityChange, onDeleteIcon, onDeleteText }: Props) {
  const icons = data?.layers.icons ?? [];
  const texts = data?.layers.texts ?? [];

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Modo de renderização</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Fidelidade vs. limpeza visual</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            variant={mode === "high_fidelity" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => onModeChange("high_fidelity")}
          >
            Alta fidelidade
          </Button>
          <Button
            size="sm"
            variant={mode === "clean" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => onModeChange("clean")}
          >
            Planta limpa
          </Button>
        </div>
      </div>

      <div className="p-4 border-b border-border space-y-2">
        <h3 className="text-xs font-semibold text-foreground">Camadas</h3>
        {LAYERS.map((l) => (
          <label key={l.key} className="flex items-center justify-between text-xs text-foreground cursor-pointer">
            <span>{l.label}</span>
            <Switch
              checked={visibility[l.key]}
              onCheckedChange={(v) => onVisibilityChange({ ...visibility, [l.key]: v })}
            />
          </label>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          <p className="text-xs font-semibold text-foreground mb-2">
            Ícones detectados <span className="text-muted-foreground font-normal">({icons.length})</span>
          </p>
          <div className="space-y-1.5 mb-4">
            {icons.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum ícone.</p>}
            {icons.map((o) => (
              <div key={o.id} className="group rounded-md border border-border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{o.label || o.type}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{o.type}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={`text-[10px] ${confColor(o.confidence)}`}>
                      {Math.round(o.confidence * 100)}%
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100"
                      onClick={() => onDeleteIcon(o.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold text-foreground mb-2">
            Textos detectados <span className="text-muted-foreground font-normal">({texts.length})</span>
          </p>
          <div className="space-y-1.5">
            {texts.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum texto.</p>}
            {texts.map((t) => (
              <div key={t.id} className="group rounded-md border border-border px-3 py-2 flex items-start justify-between gap-2">
                <p className="text-xs text-foreground truncate flex-1">{t.text}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100"
                  onClick={() => onDeleteText(t.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
