import { createFileRoute } from "@tanstack/react-router";

export const ANALYSIS_TYPES = [
  "stage",
  "tent",
  "bathroom",
  "ambulance",
  "medical",
  "generator",
  "food_truck",
  "emergency_exit",
  "fire_extinguisher",
  "text",
  "wall",
  "area",
  "gate",
  "unknown",
] as const;

type AnalysisType = (typeof ANALYSIS_TYPES)[number];

type Detected = {
  id: string;
  type: AnalysisType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
};

type AnalysisResult = {
  canvas: {
    width: number;
    height: number;
  };
  objects: Detected[];
};

type ImagePayload = {
  base64: string;
  mimeType: string;
  dimensions: {
    width: number;
    height: number;
  };
};

const TYPE_SET = new Set<string>(ANALYSIS_TYPES);
const DEFAULT_CANVAS = { width: 1000, height: 680 };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/analyze-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);
        }

        const image = await imageFromRequest(request).catch((error) => {
          if (error instanceof Error) return error;
          return new Error("Could not read uploaded image.");
        });
        if (image instanceof Error) {
          return json({ error: image.message }, image.message.includes("10MB") ? 413 : 400);
        }
        if (!image) {
          return json({ error: "Send an image as multipart field 'file' or 'image'." }, 400);
        }

        const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
            max_tokens: 4096,
            temperature: 0,
            system:
              "You are a precise visual detection engine. Return only strict JSON. Do not include markdown, code fences, or explanation.",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mimeType,
                      data: image.base64,
                    },
                  },
                  {
                    type: "text",
                    text: promptForImage(image.dimensions),
                  },
                ],
              },
            ],
          }),
        });

        if (!claudeResponse.ok) {
          const detail = await claudeResponse.text().catch(() => "");
          return json({ error: "Claude Vision request failed.", detail }, claudeResponse.status);
        }

        const data = (await claudeResponse.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const text = data.content?.find((part) => part.type === "text" && part.text)?.text;
        if (!text) {
          return json({ error: "Claude Vision returned an empty response." }, 502);
        }

        try {
          const parsed = extractJson(text);
          return json(normalizeAnalysis(parsed, image.dimensions));
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Could not parse Claude JSON." },
            502,
          );
        }
      },
    },
  },
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function imageFromRequest(request: Request): Promise<ImagePayload | null> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file") ?? form?.get("image");
  if (!(file instanceof File)) return null;
  if (!file.type.startsWith("image/")) return null;
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 10MB or smaller.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    base64: bytesToBase64(bytes),
    mimeType: file.type || "image/png",
    dimensions: readImageDimensions(bytes),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function promptForImage(dimensions: { width: number; height: number }) {
  return `Analyze this image as an event map, venue plan, aerial photo, or floorplan.

Return only one valid JSON object exactly matching this schema:
{
  "canvas": { "width": number, "height": number },
  "objects": [
    {
      "id": string,
      "type": "stage" | "tent" | "bathroom" | "ambulance" | "medical" | "generator" | "food_truck" | "emergency_exit" | "fire_extinguisher" | "text" | "wall" | "area" | "gate" | "unknown",
      "label": string,
      "x": number,
      "y": number,
      "width": number,
      "height": number,
      "rotation": number,
      "confidence": number
    }
  ]
}

Use the original image pixel coordinate system. The image dimensions are ${dimensions.width}x${dimensions.height}.
x and y are the top-left corner of the bounding box. width and height are positive pixels. rotation is degrees clockwise. confidence is 0 to 1.
Use only the allowed type strings. If unsure, use "unknown".`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Claude did not return valid JSON.");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeAnalysis(
  value: unknown,
  fallbackCanvas: { width: number; height: number },
): AnalysisResult {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawCanvas =
    source.canvas && typeof source.canvas === "object"
      ? (source.canvas as Record<string, unknown>)
      : {};
  const canvasWidth = Math.round(clamp(number(rawCanvas.width, fallbackCanvas.width), 1, 20000));
  const canvasHeight = Math.round(clamp(number(rawCanvas.height, fallbackCanvas.height), 1, 20000));
  const rawObjects = Array.isArray(source.objects) ? source.objects : [];

  return {
    canvas: { width: canvasWidth, height: canvasHeight },
    objects: rawObjects
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .slice(0, 160)
      .map((item, index) => {
        const type =
          typeof item.type === "string" && TYPE_SET.has(item.type)
            ? (item.type as AnalysisType)
            : "unknown";
        return {
          id: stringValue(item.id, `${type}-${index + 1}`, 64),
          type,
          label: stringValue(item.label, type.replaceAll("_", " "), 80),
          x: Math.round(clamp(number(item.x, 0), 0, canvasWidth - 1)),
          y: Math.round(clamp(number(item.y, 0), 0, canvasHeight - 1)),
          width: Math.round(clamp(number(item.width, 40), 1, canvasWidth)),
          height: Math.round(clamp(number(item.height, 40), 1, canvasHeight)),
          rotation: number(item.rotation, 0),
          confidence: clamp(number(item.confidence, 0.5), 0, 1),
        };
      }),
  };
}

function number(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readImageDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += 2 + length;
    }
  }

  if (
    bytes.length >= 30 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (format === "VP8X") {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
    if (format === "VP8 " && bytes.length >= 30) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (format === "VP8L" && bytes.length >= 25) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return DEFAULT_CANVAS;
}
