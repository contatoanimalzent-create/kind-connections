import { createFileRoute } from "@tanstack/react-router";

type Detected = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  text?: string;
};

const MOCK: Detected[] = [
  { id: "area-1", type: "area", label: "Área Principal", x: 60, y: 60, width: 880, height: 560, confidence: 0.98 },
  { id: "palco-1", type: "palco", label: "Palco", x: 380, y: 90, width: 240, height: 90, confidence: 0.96 },
  { id: "tenda-1", type: "tenda", label: "Tenda VIP", x: 110, y: 240, width: 120, height: 90, confidence: 0.91 },
  { id: "tenda-2", type: "tenda", label: "Tenda Staff", x: 110, y: 360, width: 120, height: 90, confidence: 0.88 },
  { id: "food-1", type: "food_truck", label: "Food Truck 1", x: 270, y: 240, width: 80, height: 50, confidence: 0.93 },
  { id: "food-2", type: "food_truck", label: "Food Truck 2", x: 270, y: 310, width: 80, height: 50, confidence: 0.9 },
  { id: "food-3", type: "food_truck", label: "Food Truck 3", x: 270, y: 380, width: 80, height: 50, confidence: 0.87 },
  { id: "gerador-1", type: "gerador", label: "Gerador", x: 820, y: 480, width: 70, height: 60, confidence: 0.85 },
  { id: "banheiro-1", type: "banheiro", label: "Banheiros", x: 700, y: 480, width: 100, height: 70, confidence: 0.94 },
  { id: "ambulancia-1", type: "ambulancia", label: "Ambulância", x: 820, y: 240, width: 90, height: 60, confidence: 0.92 },
  { id: "medico-1", type: "posto_medico", label: "Posto Médico", x: 700, y: 240, width: 100, height: 80, confidence: 0.9 },
  { id: "saida-1", type: "saida", label: "Saída 1", x: 60, y: 340, width: 30, height: 60, confidence: 0.97 },
  { id: "saida-2", type: "saida", label: "Saída 2", x: 910, y: 340, width: 30, height: 60, confidence: 0.97 },
  { id: "saida-3", type: "saida", label: "Saída 3", x: 480, y: 590, width: 60, height: 30, confidence: 0.96 },
  { id: "extintor-1", type: "extintor", label: "Extintor", x: 400, y: 200, width: 24, height: 24, confidence: 0.82 },
  { id: "extintor-2", type: "extintor", label: "Extintor", x: 600, y: 200, width: 24, height: 24, confidence: 0.83 },
  { id: "extintor-3", type: "extintor", label: "Extintor", x: 500, y: 500, width: 24, height: 24, confidence: 0.81 },
  { id: "texto-1", type: "texto", label: "Texto", x: 420, y: 40, width: 160, height: 20, confidence: 0.99, text: "ENTRADA PRINCIPAL" },
];

export const Route = createFileRoute("/api/analyze-image")({
  server: {
    handlers: {
      POST: async () => {
        await new Promise((r) => setTimeout(r, 800));
        return Response.json({
          width: 1000,
          height: 680,
          objects: MOCK,
        });
      },
    },
  },
});
