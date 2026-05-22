import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { FloorplanScene, type Volume } from "@/lib/floorplan/three3d";

export function Viewer3D({
  open,
  volumes,
  onClose,
}: {
  open: boolean;
  volumes: Volume[];
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<FloorplanScene | null>(null);

  useEffect(() => {
    if (!open || !mountRef.current) return;
    const scene = new FloorplanScene(mountRef.current);
    sceneRef.current = scene;
    scene.build(volumes);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [open, volumes]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          Visualizacao 3D
          <span className="text-xs font-normal text-slate-400">
            {volumes.length} volumes - arraste para orbitar, scroll para zoom
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={mountRef} className="min-h-0 flex-1" />
    </div>
  );
}
