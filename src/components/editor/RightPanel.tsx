import {
  ArrowUpRight,
  BringToFront,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setObjectData } from "@/lib/floorplan-render";
import type { FloorplanEditor } from "@/hooks/useFloorplanEditor";
import { ColorInput, NumberInput, ReadOnly } from "./Inputs";

export function RightPanel({ editor }: { editor: FloorplanEditor }) {
  const {
    selectedObject,
    selectedData,
    selectedBounds,
    layers,
    activeLayerId,
    layerRows,
    fillColor,
    strokeColor,
    updateSelected,
    commitSelected,
    duplicateSelection,
    lockSelected,
    deleteSelection,
    setFillColor,
    setStrokeColor,
    changeSelectedLayer,
    addLayer,
    updateLayer,
    setActiveLayerId,
    toggleLayerObject,
    moveObject,
    selectObjectById,
  } = editor;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      {/* Properties */}
      <div className="border-b border-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Propriedades</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={!selectedObject} onClick={duplicateSelection}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" disabled={!selectedObject} onClick={lockSelected}>
              {selectedData?.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" disabled={!selectedObject} onClick={deleteSelection}>
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </div>

        {!selectedObject || !selectedData || !selectedBounds ? (
          <p className="rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
            Selecione qualquer item no canvas para editar nome, tipo, posicao, cor, borda, opacidade,
            camada e confidence.
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
                onChange={(value) => updateSelected({ opacity: Math.max(0, Math.min(1, value / 100)) })}
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
                  setObjectData(selectedObject, { ...selectedData, layerId: event.target.value });
                  changeSelectedLayer(event.target.value);
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

      {/* Layers */}
      <div className="border-b border-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4" /> Camadas
          </h2>
          <button className="text-xs text-cyan-300" onClick={addLayer}>
            Nova
          </button>
        </div>
        <div className="space-y-2">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`rounded-md border p-2 ${
                activeLayerId === layer.id
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-800 bg-slate-900"
              }`}
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
                <span className="text-[10px] text-slate-500">{Math.round(layer.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(layer.opacity * 100)}
                onChange={(event) => updateLayer(layer.id, { opacity: Number(event.target.value) / 100 })}
                className="mt-2 w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Objects */}
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
            <div key={row.id} className="group rounded-md border border-slate-800 bg-slate-900 p-2 text-xs">
              <div className="flex items-center gap-2">
                <button onClick={() => toggleLayerObject(row.id, "visible")}>
                  {row.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => toggleLayerObject(row.id, "locked")}>
                  {row.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => selectObjectById(row.id)}
                >
                  {row.name}
                </button>
                <button onClick={() => moveObject(row.id, "up")}>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 pl-14 text-[10px] uppercase tracking-wide text-slate-500">{row.type}</p>
            </div>
          ))}
          {layerRows.length === 0 && <p className="text-xs text-slate-500">Nenhum objeto ainda.</p>}
        </div>
      </div>
    </aside>
  );
}
