import { load } from "cheerio/slim";

export type RouteResult = {
  departureStation: string;
  departurePlatform: string;
  departureDate: string;
  departureTime: string;
  arrivalStation: string;
  arrivalPlatform: string;
  arrivalDate: string;
  arrivalTime: string;
  carrier: string;
  trainNumber: string;
  category: string;
  relation: string;
  duration: string;
  transfers: number;
  detailsUrl: string;
};

export type DelayResult = {
  summary: string;
  detailsUrl: string;
  difficulties: string[];
};

export type DisruptionResult = {
  title: string;
  body: string[];
};

export type StationBoardEntry = {
  time: string;
  delayMinutes: number;
  platform: string;
  track: string;
  carrier: string;
  trainName: string;
  trainNumber: string;
  relationFrom: string;
  relationTo: string;
  difficulties: string[];
};

export function parseRoutes(html: string): RouteResult[] {
  const $ = load(html);

  return $(".search-results__item")
    .toArray()
    .map((element) => {
      const card = $(element);
      const stations = card.find(".timeline__content-station");
      const platforms = card.find(".timeline__content-platform");
      const start = card.find(".search-results__item-times--start");
      const end = card.find(".search-results__item-times--end");
      const metaCol = card.find(".col-3.col-12--phone.inline-center.box--flex--column").first();
      const detailsUrl = card.find('a[href*="/WynikiWyszukiwania/SzczegolyPolaczenia"]').last().attr("href") ?? "";

      return {
        departureStation: cleanText($(stations.get(1)).text()),
        departurePlatform: cleanText($(platforms.get(0)).text()),
        departureDate: cleanText(start.find(".search-results__item-date").text()),
        departureTime: cleanText(start.find(".search-results__item-hour").text()),
        arrivalStation: cleanText($(stations.get(2)).text()),
        arrivalPlatform: cleanText($(platforms.get(1)).text()),
        arrivalDate: cleanText(end.find(".search-results__item-date").text()),
        arrivalTime: cleanText(end.find(".search-results__item-hour").text()),
        carrier: cleanVisibleText(metaCol.find("p.item-label").first()),
        trainNumber: cleanVisibleText(metaCol.find(".search-results__item-train-nr").first()),
        category: cleanVisibleText(metaCol.find("p.item-label").eq(1)),
        relation: cleanVisibleText(metaCol.find(".search-results__item-train-relation").first()),
        duration: cleanVisibleText(card.find(".search-results__item-train-nr.txlc").first()),
        transfers: Number.parseInt(cleanText(card.find(".add-arrow-to-right-before strong").first().text()), 10) || 0,
        detailsUrl,
      };
    });
}

export function parseDelayResults(html: string): DelayResult[] {
  const $ = load(html);

  return $(".delays-table__row")
    .toArray()
    .map((element) => {
      const row = $(element);
      const detailsUrl = row.find('a[href*="/WynikiWyszukiwania/SzczegolyPolaczenia"]').attr("href") ?? "";
      const difficultiesRaw = row.find("button[data-difficulties]").attr("data-difficulties") ?? "";

      return {
        summary: cleanVisibleText(row),
        detailsUrl,
        difficulties: parseDifficulties(difficultiesRaw),
      };
    });
}

export function parseDisruptions(html: string): DisruptionResult[] {
  const $ = load(html);

  return $(".message-box, .disruption-box, .difficulty-container")
    .toArray()
    .map((element) => {
      const box = $(element);
      const title = cleanVisibleText(box.find("h3, h4, .heading, .title").first() || box);
      const body = box
        .find("p, li")
        .toArray()
        .map((node) => cleanVisibleText($(node)))
        .filter(Boolean);

      return { title, body };
    })
    .filter((item) => item.title || item.body.length > 0);
}

export function parseStationBoard(payload: unknown): StationBoardEntry[] {
  const data = payload as { R?: Array<Record<string, string>> };

  return (data.R ?? []).map((entry) => ({
    time: entry.G ?? "",
    delayMinutes: Number.parseInt(entry.O ?? "0", 10) || 0,
    platform: entry.P ?? "",
    track: entry.T ?? "",
    carrier: entry.PR ?? "",
    trainName: entry.NP ?? "",
    trainNumber: entry.NR ?? "",
    relationFrom: entry.RP ?? "",
    relationTo: entry.RK ?? "",
    difficulties: parseDifficulties(entry.U ?? ""),
  }));
}

export function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanVisibleText(node: any) {
  const root = typeof node === "string" ? load(node).root() : node;
  const clone = root.clone();
  clone.find(".visuallyhidden").remove();
  return cleanText(clone.text());
}

export function parseDifficulties(value: string) {
  if (!value) {
    return [];
  }

  const parts = value.split("#").slice(1);
  const output: string[] = [];

  for (const part of parts) {
    const chunk = cleanText(part);
    if (!chunk) {
      continue;
    }

    for (const nested of chunk.split("^")) {
      const item = cleanText(nested);
      if (item) {
        output.push(item);
      }
    }
  }

  return output;
}
