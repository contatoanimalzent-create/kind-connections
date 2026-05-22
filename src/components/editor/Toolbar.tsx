import {
  ArrowUpRight,
  Box,
  CircleOff,
  Hand,
  LineChart,
  MousePointer2,
  Pencil,
  Pentagon,
  RectangleHorizontal,
  Ruler,
  SquareDashedMousePointer,
  Type,
} from "lucide-react";
import type { Tool, ToolItem } from "@/lib/floorplan/types";

export const TOOL_ITEMS: ToolItem[] = [
  { id: "select", label: "Selecionar (V)", icon: MousePointer2 },
  { id: "hand", label: "Mover tela (H)", icon: Hand },
  { id: "rect", label: "Retangulo (R)", icon: RectangleHorizontal },
  { id: "line", label: "Linha (L)", icon: LineChart },
  { id: "arrow", label: "Seta", icon: ArrowUpRight },
  { id: "polygon", label: "Poligono", icon: Pentagon },
  { id: "pen", label: "Caneta livre (P)", icon: Pencil },
  { id: "text", label: "Texto (T)", icon: Type },
  { id: "measure", label: "Medida", icon: Ruler },
  { id: "eraser", label: "Borracha", icon: CircleOff },
  { id: "area", label: "Area/zona", icon: SquareDashedMousePointer },
  { id: "object", label: "Icone/objeto", icon: Box },
];

export function Toolbar({
  tool,
  onSelect,
}: {
  tool: Tool;
  onSelect: (tool: Tool) => void;
}) {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-800 bg-slate-950 py-3">
      {TOOL_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = tool === item.id;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onSelect(item.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-md border transition ${
              active
                ? "border-cyan-400 bg-cyan-400 text-slate-950"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"
            }`}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </aside>
  );
}
