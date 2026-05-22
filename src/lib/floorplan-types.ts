// Normalized coords are all in 0..1 (relative to the original image).
export type Pt = [number, number];

export type LayerBoundary = {
  id: string;
  shape: "polyline" | "polygon" | "rect";
  points?: Pt[]; // for polyline/polygon
  bbox?: [number, number, number, number]; // x,y,w,h for rect
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  fill?: string;
  label?: string;
};

export type LayerZone = {
  id: string;
  shape: "polygon" | "rect";
  points?: Pt[];
  bbox?: [number, number, number, number];
  fill: string;
  opacity?: number;
  label?: string;
};

export type LayerIcon = {
  id: string;
  type: string; // palco, tenda, food_truck, banheiro, gerador, ambulancia, posto_medico, saida, extintor, unknown, ...
  bbox: [number, number, number, number];
  label: string;
  confidence: number;
  color?: string;
};

export type LayerText = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number; // normalized to image height
  color?: string;
  weight?: "normal" | "bold";
  rotation?: number;
  confidence?: number;
};

export type LayerLegendItem = { symbol?: string; color?: string; label: string };
export type LayerLegend = {
  id: string;
  bbox: [number, number, number, number];
  items: LayerLegendItem[];
};

export type FloorPlanData = {
  width: number; // original image px
  height: number;
  imageUrl?: string; // for background_reference
  layers: {
    boundaries: LayerBoundary[];
    zones: LayerZone[];
    icons: LayerIcon[];
    texts: LayerText[];
    legend: LayerLegend[];
  };
};

export type RenderMode = "high_fidelity" | "clean";

export type LayerVisibility = {
  background_reference: boolean;
  boundaries: boolean;
  zones: boolean;
  icons: boolean;
  texts: boolean;
  legend: boolean;
};
