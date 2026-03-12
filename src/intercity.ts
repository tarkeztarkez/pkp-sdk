import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { load } from "cheerio";
import { parseTrainConsistsTsv } from "./parsers";

const TRAIN_CONSISTS_PAGE_URL =
  "https://www.intercity.pl/pl/site/dla-pasazera/kup-bilet/pociagi-i-stacje/zestawienia-pociagow.html";
const USER_AGENT = "Mozilla/5.0";
const CACHE_DIR = join("/tmp", "pkp-cli-intercity");

export type TrainConsistStation = {
  name: string;
  pdfUrl: string;
  validFromHint: string;
};

export async function fetchTrainConsistStations(): Promise<TrainConsistStation[]> {
  const response = await fetch(TRAIN_CONSISTS_PAGE_URL, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Intercity station index returned ${response.status}.`);
  }

  const html = await response.text();
  const $ = load(html);
  const baseHref = $("base").attr("href") ?? "/pl/";
  const baseUrl = new URL(baseHref, TRAIN_CONSISTS_PAGE_URL);

  return $("a.download--pdf")
    .toArray()
    .map((anchor) => {
      const element = $(anchor);
      const href = element.attr("href") ?? "";
      const text = element.text();
      const match = text.match(/dla stacji\s+(.+?)\s+\(pdf/i);

      return {
        name: cleanLabel(match?.[1] ?? text),
        pdfUrl: new URL(href, baseUrl).toString(),
        validFromHint: extractValidFromHint(href),
      };
    })
    .filter((entry) => entry.name && entry.pdfUrl.endsWith(".pdf"));
}

export async function getTrainConsists(input: { station: string; train: string }) {
  const stationQuery = requireValue(input.station, "station");
  const trainQuery = requireValue(input.train, "train");
  const stations = await fetchTrainConsistStations();
  const station = resolveStationDocument(stations, stationQuery);
  const pdfPath = await downloadPdf(station.pdfUrl);
  const tsv = await runPdftotext(pdfPath);
  const parsed = parseTrainConsistsTsv(tsv);

  const trainQueryNormalized = normalizeLoose(trainQuery);
  const numericQuery = /^\d+(?:\/\d+)*$/.test(cleanLabel(trainQuery));
  const matches = parsed.entries.filter((entry) => {
    if (matchesTrainNumber(entry.trainNumber, trainQuery)) {
      return true;
    }

    if (numericQuery) {
      return false;
    }

    const haystack = normalizeLoose(`${entry.trainNumber} ${entry.trainName}`);
    return haystack.includes(trainQueryNormalized);
  });

  return {
    query: {
      station: stationQuery,
      train: trainQuery,
    },
    station: {
      name: station.name,
      pdfUrl: station.pdfUrl,
    },
    validFrom: parsed.validFrom || station.validFromHint,
    validTo: parsed.validTo,
    count: matches.length,
    matches,
  };
}

function resolveStationDocument(stations: TrainConsistStation[], query: string) {
  if (stations.length === 0) {
    throw new Error("Intercity train consist station index returned no PDFs.");
  }

  const normalizedQuery = normalizeLoose(query);
  const exact = stations.find((station) => normalizeLoose(station.name) === normalizedQuery);
  if (exact) {
    return exact;
  }

  const partials = stations.filter((station) => normalizeLoose(station.name).includes(normalizedQuery));
  if (partials.length === 1) {
    return partials[0]!;
  }

  if (partials.length > 1) {
    throw new Error(`Station is ambiguous. Matching station PDFs: ${partials.map((station) => station.name).join(", ")}`);
  }

  throw new Error(`No Intercity train consist PDF found for station "${query}".`);
}

async function downloadPdf(url: string) {
  await mkdir(CACHE_DIR, { recursive: true });
  const hash = createHash("sha1").update(url).digest("hex");
  const path = join(CACHE_DIR, `${hash}.pdf`);
  const alreadyDownloaded = await fileExistsWithContent(path);

  if (!alreadyDownloaded) {
    const command = [
      "curl",
      "--http1.1",
      "-A",
      shellEscape(USER_AGENT),
      "-e",
      shellEscape(TRAIN_CONSISTS_PAGE_URL),
      "-L",
      "--silent",
      "--show-error",
      "--fail",
      "--output",
      shellEscape(path),
      shellEscape(url),
    ].join(" ");
    const process = Bun.spawn(["sh", "-lc", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stderr, exitCode] = await Promise.all([
      new Response(process.stderr).text(),
      process.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(cleanLabel(stderr) || "Intercity PDF download failed.");
    }

    if (!(await fileExistsWithContent(path))) {
      throw new Error("Intercity PDF download did not create the expected file.");
    }
  }

  return path;
}

async function runPdftotext(pdfPath: string) {
  const process = Bun.spawn(["pdftotext", "-tsv", pdfPath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(cleanLabel(stderr) || "pdftotext failed while parsing the train consist PDF.");
  }

  return stdout;
}

function extractValidFromHint(href: string) {
  const match = href.match(/od-(\d{2})-(\d{2})-(\d{4})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "";
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function matchesTrainNumber(trainNumber: string, query: string) {
  const cleanQuery = cleanLabel(query);
  if (!cleanQuery) {
    return false;
  }

  const compactTrainNumber = cleanLabel(trainNumber);
  const numericOnlyQuery = /^\d+(?:\/\d+)*$/.test(cleanQuery);
  if (!numericOnlyQuery && compactTrainNumber.includes(cleanQuery)) {
    return true;
  }

  const queryDigits = digitsOnly(cleanQuery);
  if (!queryDigits) {
    return false;
  }

  for (const token of compactTrainNumber.match(/\d+(?:\/\d+)*/g) ?? []) {
    if (!token.startsWith(queryDigits)) {
      continue;
    }

    const boundary = token[queryDigits.length];
    if (!boundary || boundary === "/") {
      return true;
    }
  }

  return false;
}

function normalizeLoose(value: string) {
  return cleanLabel(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase();
}

function requireValue(value: string, label: string) {
  const clean = value.trim();
  if (!clean) {
    throw new Error(`Missing required ${label}.`);
  }
  return clean;
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function fileExistsWithContent(path: string) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}
