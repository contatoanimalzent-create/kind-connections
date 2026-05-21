import { Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Detected } from "@/lib/floorplan-render";

interface Props {
  objects: Detected[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onAdd: (type: string) => void;
}

const TYPES = [
  { type: "tenda", label: "Tenda" },
  { type: "food_truck", label: "Food Truck" },
  { type: "banheiro", label: "Banheiro" },
  { type: "gerador", label: "Gerador" },
  { type: "extintor", label: "Extintor" },
  { type: "saida", label: "Saída" },
  { type: "posto_medico", label: "Posto Médico" },
  { type: "ambulancia", label: "Ambulância" },
  { type: "texto", label: "Texto" },
];

function confColor(c: number) {
  if (c >= 0.9) return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
  if (c >= 0.8) return "bg-amber-500/10 text-amber-700 border-amber-200";
  return "bg-rose-500/10 text-rose-700 border-rose-200";
}

export function ObjectSidebar({ objects, selectedId, onSelect, onDelete, onRename, onAdd }: Props) {
  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Objetos detectados</h2>
        <p className="text-xs text-muted-foreground mt-1">{objects.length} elementos</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {objects.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhum objeto ainda. Gere a planta baixa primeiro.
            </p>
          )}
          {objects.map((o) => (
            <div
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`group rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                selectedId === o.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{o.label}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                    {o.type.replace("_", " ")}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${confColor(o.confidence)}`}>
                  {Math.round(o.confidence * 100)}%
                </Badge>
              </div>
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onRename(o.id); }}>
                  <Pencil className="h-3 w-3 mr-1" /> Renomear
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(o.id); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <p className="text-xs font-semibold text-foreground mb-2">Adicionar objeto</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TYPES.map((t) => (
            <Button
              key={t.type}
              size="sm"
              variant="outline"
              className="h-7 text-xs justify-start"
              onClick={() => onAdd(t.type)}
            >
              + {t.label}
            </Button>
          ))}
        </div>
      </div>
    </aside>
  );
}
