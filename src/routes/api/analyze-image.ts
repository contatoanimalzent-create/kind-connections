import { createFileRoute } from "@tanstack/react-router";
import type { FloorPlanData } from "@/lib/floorplan-types";

const SYSTEM_PROMPT = `Você é um conversor de mapas/croquis de eventos em PLANTAS BAIXAS por CAMADAS.

OBJETIVO: máxima FIDELIDADE VISUAL ao original. NÃO simplifique. NÃO invente. NÃO remova textos.

Coordenadas SEMPRE normalizadas de 0 a 1 (x da esquerda, y de cima).
Para bbox: [x, y, w, h]. Para points: [[x,y], ...].

Devolva APENAS JSON válido (sem markdown) neste formato exato:
{
  "width": <px imagem original>,
  "height": <px imagem original>,
  "layers": {
    "boundaries": [
      { "id":"b1", "shape":"polygon"|"polyline"|"rect",
        "points":[[x,y],...] OR "bbox":[x,y,w,h],
        "stroke":"#hex", "strokeWidth":2, "dashed":false, "fill":"#hex?|transparent", "label":"opcional" }
    ],
    "zones": [
      { "id":"z1", "shape":"polygon"|"rect",
        "points":[...] OR "bbox":[x,y,w,h],
        "fill":"#hex", "opacity":0.5, "label":"Área VIP" }
    ],
    "icons": [
      { "id":"i1", "type":"palco|tenda|food_truck|banheiro|gerador|ambulancia|posto_medico|saida|extintor|unknown",
        "bbox":[x,y,w,h], "label":"texto curto", "confidence":0..1, "color":"#hex opcional" }
    ],
    "texts": [
      { "id":"t1", "text":"conteúdo exato", "x":0..1, "y":0..1, "fontSize":0..1 (proporcional à altura), "color":"#hex", "weight":"bold|normal", "rotation":0, "confidence":0..1 }
    ],
    "legend": [
      { "id":"lg1", "bbox":[x,y,w,h], "items":[{"symbol":"opt","color":"#hex","label":"texto"}] }
    ]
  }
}

REGRAS CRÍTICAS:
- Detecte TODOS os textos visíveis (títulos, labels, números, legendas). Não pule nenhum.
- Detecte TODAS as áreas coloridas como "zones" com a COR REAL aproximada em hex.
- Detecte TODAS as linhas/perímetros/caminhos como "boundaries" (polyline para caminhos, polygon para áreas fechadas).
- Detecte TODOS os ícones/objetos. Se não souber o tipo, use "unknown" e preencha label com o que estiver escrito ou descrição curta.
- Se há uma legenda/quadro de símbolos, coloque em "legend".
- NUNCA invente itens que não existem na imagem.
- NUNCA agrupe textos diferentes em um só.
- Cores em hex (#rrggbb).`;

const FALLBACK: FloorPlanData = {
  width: 1000,
  height: 680,
  layers: {
    boundaries: [
      { id: "b1", shape: "rect", bbox: [0.05, 0.08, 0.9, 0.84], stroke: "#0a0a0a", strokeWidth: 2, dashed: true },
    ],
    zones: [
      { id: "z1", shape: "rect", bbox: [0.38, 0.12, 0.24, 0.14], fill: "#111111", opacity: 0.85, label: "Palco" },
    ],
    icons: [
      { id: "i1", type: "saida", bbox: [0.05, 0.5, 0.04, 0.08], label: "Saída", confidence: 0.5 },
      { id: "i2", type: "tenda", bbox: [0.12, 0.35, 0.12, 0.12], label: "Tenda", confidence: 0.5 },
    ],
    texts: [
      { id: "t1", text: "EXEMPLO — IA indisponível", x: 0.3, y: 0.05, fontSize: 0.025, weight: "bold", color: "#dc2626" },
    ],
    legend: [],
  },
};

async function callVision(imageDataUrl: string): Promise<FloorPlanData | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Converta esta imagem em planta baixa por camadas com máxima fidelidade. Retorne SOMENTE JSON." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("AI gateway error", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as Partial<FloorPlanData>;
    const layers = parsed.layers ?? ({} as Partial<FloorPlanData["layers"]>);
    const data: FloorPlanData = {
      width: Number(parsed.width) || 1000,
      height: Number(parsed.height) || 680,
      layers: {
        boundaries: Array.isArray(layers.boundaries) ? layers.boundaries : [],
        zones: Array.isArray(layers.zones) ? layers.zones : [],
        icons: Array.isArray(layers.icons) ? layers.icons : [],
        texts: Array.isArray(layers.texts) ? layers.texts : [],
        legend: Array.isArray(layers.legend) ? layers.legend : [],
      },
    };
    // give ids if missing
    let n = 0;
    const idify = <T extends { id?: string }>(arr: T[], prefix: string) =>
      arr.forEach((o) => { if (!o.id) o.id = `${prefix}-${++n}`; });
    idify(data.layers.boundaries, "b");
    idify(data.layers.zones, "z");
    idify(data.layers.icons, "i");
    idify(data.layers.texts, "t");
    idify(data.layers.legend, "lg");
    return data;
  } catch (e) {
    console.error("Parse error", e);
    return null;
  }
}

export const Route = createFileRoute("/api/analyze-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "Arquivo ausente" }, { status: 400 });
          }
          const buf = await file.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          const mime = file.type || "image/png";
          const dataUrl = `data:${mime};base64,${b64}`;

          const data = await callVision(dataUrl);
          if (!data) {
            return Response.json({ data: FALLBACK, fallback: true });
          }
          const totals =
            data.layers.boundaries.length +
            data.layers.zones.length +
            data.layers.icons.length +
            data.layers.texts.length +
            data.layers.legend.length;
          if (totals === 0) {
            return Response.json({ data: FALLBACK, fallback: true });
          }
          return Response.json({ data });
        } catch (e) {
          console.error(e);
          return Response.json({ data: FALLBACK, fallback: true });
        }
      },
    },
  },
});
