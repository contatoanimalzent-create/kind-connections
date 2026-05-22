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

const CANVAS_W = 1000;
const CANVAS_H = 680;

const MOCK_FALLBACK: Detected[] = [
  { id: "area-1", type: "area", label: "Área Principal", x: 60, y: 60, width: 880, height: 560, confidence: 0.6 },
  { id: "palco-1", type: "palco", label: "Palco", x: 380, y: 90, width: 240, height: 90, confidence: 0.6 },
  { id: "tenda-1", type: "tenda", label: "Tenda", x: 110, y: 240, width: 120, height: 90, confidence: 0.6 },
  { id: "saida-1", type: "saida", label: "Saída", x: 60, y: 340, width: 30, height: 60, confidence: 0.6 },
];

const SYSTEM_PROMPT = `Você analisa uma imagem de mapa/croqui de evento e devolve, em JSON, todos os elementos visíveis convertidos para uma planta baixa.

Regras OBRIGATÓRIAS:
- Coordenadas em pixels num canvas ${CANVAS_W}x${CANVAS_H}.
- Mapeie a imagem inteira para esse canvas mantendo as proporções e posições RELATIVAS reais do que você vê.
- Identifique TODOS os elementos visíveis: a área/perímetro do evento, palco, tendas, food trucks, banheiros, gerador, ambulância, posto médico, saídas de emergência, extintores, e textos importantes.
- Use SOMENTE estes valores em "type": area, palco, tenda, food_truck, banheiro, gerador, ambulancia, posto_medico, saida, extintor, texto.
- "label" curto em português. Para "texto", inclua o conteúdo em "text".
- "confidence" entre 0 e 1.
- Não invente itens que não existem na imagem. Se a imagem não contém algo, não inclua.
- Responda APENAS JSON válido, sem markdown, no formato: {"objects":[{...}]}`;

async function callVision(imageDataUrl: string): Promise<Detected[] | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Analise esta imagem e gere a planta baixa em JSON. Canvas ${CANVAS_W}x${CANVAS_H}.` },
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
    const parsed = JSON.parse(content) as { objects?: Detected[] };
    if (!Array.isArray(parsed.objects)) return null;
    return parsed.objects
      .filter((o) => o && typeof o.type === "string")
      .map((o, i) => ({
        id: o.id || `${o.type}-${i}-${Date.now()}`,
        type: o.type,
        label: o.label || o.type,
        x: clamp(Number(o.x) || 0, 0, CANVAS_W),
        y: clamp(Number(o.y) || 0, 0, CANVAS_H),
        width: clamp(Number(o.width) || 60, 8, CANVAS_W),
        height: clamp(Number(o.height) || 60, 8, CANVAS_H),
        confidence: clamp(Number(o.confidence) || 0.7, 0, 1),
        text: o.text,
      }));
  } catch (e) {
    console.error("Parse error", e);
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

          const objects = await callVision(dataUrl);
          if (!objects || objects.length === 0) {
            return Response.json({
              width: CANVAS_W,
              height: CANVAS_H,
              objects: MOCK_FALLBACK,
              fallback: true,
            });
          }
          return Response.json({ width: CANVAS_W, height: CANVAS_H, objects });
        } catch (e) {
          console.error(e);
          return Response.json({
            width: CANVAS_W,
            height: CANVAS_H,
            objects: MOCK_FALLBACK,
            fallback: true,
          });
        }
      },
    },
  },
});
