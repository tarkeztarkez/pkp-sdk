import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { RoutesResponse } from "../../core/src";

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};

export async function generateRoutesInfographic(
  response: RoutesResponse,
  outputPath: string,
  options: {
    discount: number;
  },
) {
  const apiKey = resolveGeminiApiKey();
  const image = await requestRoutesInfographic(response, apiKey, options);
  const absoluteOutputPath = resolve(outputPath);
  await writeFileAtomic(absoluteOutputPath, Buffer.from(image.data, "base64"));

  return {
    outputPath: absoluteOutputPath,
    mimeType: image.mimeType,
    model: GEMINI_IMAGE_MODEL,
  };
}

export function resolveGeminiApiKey(env: Record<string, string | undefined> = process.env) {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const passResult = Bun.spawnSync({
    cmd: ["pass", "show", "api/gemini"],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (passResult.exitCode !== 0) {
    const error = decodeBytes(passResult.stderr) || "pass show api/gemini failed";
    throw new Error(
      `Missing Gemini API key. Looked for GEMINI_API_KEY in env, then tried 'pass show api/gemini' (${error}).`,
    );
  }

  const fromPass = decodeBytes(passResult.stdout).trim();
  if (!fromPass) {
    throw new Error("Missing Gemini API key. 'pass show api/gemini' returned an empty value.");
  }

  return fromPass;
}

export function buildRoutesInfographicPrompt(
  response: RoutesResponse,
  options: {
    discount: number;
  },
) {
  const routes = response.routes.slice(0, 5);
  const shownCountNote =
    response.routes.length > routes.length ? `Pokazano ${routes.length} z ${response.routes.length} połączeń.` : "";

  const routeBlocks = routes
    .map((route, index) => {
      const transfers = route.transfers === 0 ? "Bez przesiadek" : `${route.transfers} przesiadk${route.transfers === 1 ? "a" : route.transfers < 5 ? "i" : "ek"}`;
      const price = route.ticketPrice === null || route.ticketPriceCurrency === null
        ? "Cena: brak"
        : `Cena: ${formatPolishPrice(route.ticketPrice, route.ticketPriceCurrency)}`;

      return [
        `${index + 1}. ${route.departureTime} -> ${route.arrivalTime} • ${route.duration}`,
        `${joinNonEmpty([route.category, route.trainNumber]) || "Brak numeru pociągu"}`,
        transfers,
        price,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Stwórz czytelną polską infografikę podróży kolejowych w układzie pionowym 9:16, zoptymalizowaną pod Telegram.",
    "Styl: nowoczesna karta informacyjna, jasna typografia, bardzo wysoki kontrast, bez stockowych zdjęć, bez ozdobników niezwiązanych z rozkładem.",
    "Cały tekst ma być częścią grafiki, nie poza nią.",
    "Nie dodawaj żadnych danych spoza wejścia. Zachowaj kolejność połączeń dokładnie taką jak w danych.",
    "Na grafice umieść:",
    `- Relację: ${response.query.from} -> ${response.query.to}`,
    `- Kontekst: ${response.query.date}, ${response.query.departureMode ? `po ${response.query.time}` : `na ${response.query.time}`}, ${response.count} połączeń`,
    `- Założenia: ulga ${options.discount}% • min. przesiadka ${response.query.minChangeMinutes} min${response.query.maxPrice === null ? "" : ` • max cena ${formatPolishPrice(response.query.maxPrice, "PLN")}`}`,
    shownCountNote ? `- Notatkę: ${shownCountNote}` : "",
    "- Dla każdego połączenia pokaż osobną kartę z godziną odjazdu i przyjazdu, czasem podróży, kategorią i numerem pociągu, krótką informacją o przesiadkach oraz finalną ceną.",
    "Dane połączeń:",
    routeBlocks,
    "Nie pokazuj linków URL na grafice.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractInlineImagePart(payload: GeminiResponse) {
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/")) {
        return {
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        };
      }
    }
  }

  return null;
}

async function requestRoutesInfographic(
  response: RoutesResponse,
  apiKey: string,
  options: {
    discount: number;
  },
) {
  const prompt = buildRoutesInfographicPrompt(response, options);
  const apiResponse = await fetch(GEMINI_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "9:16",
          imageSize: "512",
        },
      },
    }),
  });

  if (!apiResponse.ok) {
    const body = await apiResponse.text();
    throw new Error(`Gemini image generation failed (${apiResponse.status} ${apiResponse.statusText}): ${body}`);
  }

  const payload = (await apiResponse.json()) as GeminiResponse;
  const image = extractInlineImagePart(payload);
  if (!image) {
    throw new Error("Gemini image generation succeeded but returned no inline image data.");
  }

  return image;
}

async function writeFileAtomic(outputPath: string, bytes: Uint8Array) {
  await mkdir(dirname(outputPath), { recursive: true });
  const tempPath = outputPathTemporary(outputPath);
  await Bun.write(tempPath, bytes);
  await rename(tempPath, outputPath);
  await rm(tempPath, { force: true }).catch(() => undefined);
}

function outputPathTemporary(outputPath: string) {
  return `${outputPath}.${process.pid}.tmp`;
}

function decodeBytes(value: Uint8Array<ArrayBufferLike>) {
  return new TextDecoder().decode(value);
}

function formatPolishPrice(value: number, currency: string) {
  return `${value.toFixed(2).replace(".", ",")} ${currency}`;
}

function joinNonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}
