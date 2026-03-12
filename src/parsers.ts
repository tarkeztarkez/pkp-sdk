import { load } from "cheerio";

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

type TsvWord = {
  page: number;
  left: number;
  top: number;
  width: number;
  text: string;
};

type WordLine = {
  page: number;
  top: number;
  words: TsvWord[];
  text: string;
  minLeft: number;
};

export type TrainConsistSequenceItem = {
  raw: string;
  kind: "carriage" | "marker";
  carriageNumber: string;
  noteNumber: string;
};

export type TrainConsistEntry = {
  page: number;
  departureTime: string;
  platform: string;
  track: string;
  trainNumber: string;
  trainName: string;
  destinations: string[];
  variants: TrainConsistVariant[];
};

export type TrainConsistVariant = {
  relation: string;
  consistRaw: string;
  sequence: TrainConsistSequenceItem[];
  validity: string[];
  notes: string[];
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

export function parseTrainConsistsTsv(tsv: string) {
  const words = parseTsvWords(tsv);
  const dates = Array.from(
    new Set(
      words
        .filter((word) => word.page === 1 && word.top < 120)
        .map((word) => cleanText(word.text))
        .filter((text) => /^\d{2}\.\d{2}\.\d{4}$/.test(text)),
    ),
  );

  const pages = new Map<number, TsvWord[]>();
  for (const word of words) {
    const bucket = pages.get(word.page) ?? [];
    bucket.push(word);
    pages.set(word.page, bucket);
  }

  const entries: TrainConsistEntry[] = [];

  for (const [pageNumber, pageWords] of pages) {
    const lines = groupWordLines(pageWords);
    const timeWords = pageWords
      .filter((word) => TIME_PATTERN.test(word.text) && word.left >= 140 && word.left <= 220)
      .sort((left, right) => left.top - right.top);

    for (let index = 0; index < timeWords.length; index++) {
      const timeWord = timeWords[index];
      if (!timeWord) {
        continue;
      }
      const nextTime = timeWords[index + 1];
      const startTop = timeWord.top - 18;
      const endTop = (nextTime?.top ?? Number.POSITIVE_INFINITY) - 8;
      const blockLines = lines.filter((line) => line.top >= startTop && line.top < endTop);
      const blockWords = pageWords.filter((word) => word.top >= startTop && word.top < endTop);
      const headerLines = blockLines.filter((line) => line.top >= timeWord.top - 16 && line.top <= timeWord.top + 24);
      const headerWords = blockWords.filter((word) => word.top >= timeWord.top - 16 && word.top <= timeWord.top + 24);

      const platformTrackLines = unique(
        headerWords
          .filter((word) => word.left >= 240 && word.left <= 290 && /^\d+$/.test(word.text))
          .sort((left, right) => left.top - right.top || left.left - right.left)
          .map((word) => word.text),
      );

      const trainLines = groupWordLines(headerWords.filter((word) => word.left >= 300 && word.left <= 440))
        .map((line) => line.text)
        .filter(Boolean);

      const numberLineIndex = trainLines.findIndex((line) => /\d/.test(line));
      if (numberLineIndex < 0) {
        continue;
      }

      const { trainNumber, trainName } = parseTrainLabel(trainLines, numberLineIndex);
      if (!trainNumber) {
        continue;
      }

      const destinationLines = groupWordLines(headerWords.filter((word) => word.left >= 395 && word.left <= 530))
        .map((line) => line.text)
        .filter((line) => hasLetters(line) && !line.includes("objętych rezerwacją"));

      const rightLines = blockLines.filter((line) => line.minLeft >= 540);
      const consistCandidate = pickConsistLine(rightLines);
      const consistRaw = consistCandidate?.text ?? "";
      const relation = rightLines.find((line) => line.text.includes("|"))?.text ?? "";
      const notes = rightLines
        .filter((line) => line !== consistCandidate && line.text !== relation)
        .map((line) => line.text)
        .filter((line) => hasLetters(line) && !TIME_RANGE_PATTERN.test(line));

      entries.push({
        page: pageNumber,
        departureTime: timeWord.text,
        platform: platformTrackLines[0] ?? "",
        track: platformTrackLines[1] ?? "",
        trainNumber,
        trainName,
        destinations: unique(destinationLines),
        variants: buildTrainConsistVariants({
          relation: relation.replace(/\s+/g, " ").trim(),
          consistRaw,
          sequence: parseConsistSequence(consistCandidate?.words ?? []),
          notes: unique(notes),
        }),
      });
    }
  }

  return {
    validFrom: dates[0] ?? "",
    validTo: dates[1] ?? "",
    entries,
  };
}

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;
const TIME_RANGE_PATTERN = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

function parseTsvWords(tsv: string): TsvWord[] {
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((columns) => columns[0] === "5" && columns.length >= 12 && columns[11])
    .map((columns) => ({
      page: Number.parseInt(columns[1] ?? "0", 10),
      left: Number.parseFloat(columns[6] ?? "0"),
      top: Number.parseFloat(columns[7] ?? "0"),
      width: Number.parseFloat(columns[8] ?? "0"),
      text: cleanText(columns[11] ?? ""),
    }))
    .filter((word) => word.page > 0 && word.text);
}

function groupWordLines(words: TsvWord[]): WordLine[] {
  const sorted = [...words].sort((left, right) => left.top - right.top || left.left - right.left);
  const lines: WordLine[] = [];

  for (const word of sorted) {
    const last = lines.at(-1);
    if (!last || last.page !== word.page || Math.abs(last.top - word.top) > 2.4) {
      lines.push({
        page: word.page,
        top: word.top,
        words: [word],
        text: "",
        minLeft: word.left,
      });
      continue;
    }

    last.words.push(word);
    last.minLeft = Math.min(last.minLeft, word.left);
  }

  for (const line of lines) {
    line.words.sort((left, right) => left.left - right.left);
    line.text = line.words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
  }

  return lines;
}

function parseTrainLabel(lines: string[], numberLineIndex: number) {
  const numberLine = lines[numberLineIndex] ?? "";
  const combined = cleanText(lines.join(" "));
  const categoryMatch = combined.match(/\b(?:EIP|EIC|EC|IC|TLK|EN|IR)\s+([0-9]+(?:\/[0-9]+)*)/);
  const numberMatch = numberLine.match(/([0-9]+(?:\/[0-9]+)*)/);
  const trainNumber = cleanText(categoryMatch?.[1] ?? numberMatch?.[1] ?? numberLine);
  const trainName = cleanText(
    lines
      .filter((_, index) => index !== numberLineIndex)
      .map((line) => line.replace(/[*()]/g, " "))
      .join(" "),
  );

  return { trainNumber, trainName };
}

function pickConsistLine(lines: WordLine[]) {
  let best: WordLine | null = null;
  let bestScore = 0;

  for (const line of lines) {
    const score = countConsistWords(line.words);
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }

  return bestScore >= 3 ? best : null;
}

function countConsistWords(words: TsvWord[]) {
  const consistWords = words.filter((word) => isConsistWord(word.text)).length;
  const letterWords = words.filter((word) => hasLetters(word.text)).length;
  return consistWords * 10 - letterWords * 8;
}

function parseConsistSequence(words: TsvWord[]): TrainConsistSequenceItem[] {
  const sorted = [...words].sort((left, right) => left.left - right.left);
  const output: TrainConsistSequenceItem[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index];
    if (!current || !isConsistWord(current.text)) {
      continue;
    }

    let raw = current.text;
    const next = sorted[index + 1];
    if (
      next &&
      /^\d+\)$/.test(next.text) &&
      /^\d+$/.test(current.text) &&
      next.left - (current.left + current.width) < 18
    ) {
      raw = `${current.text}${next.text}`;
      index++;
    }

    for (const token of splitMergedConsistToken(raw, current.width)) {
      output.push({
        raw: token,
        kind: token.includes("_") || !/\d/.test(token) ? "marker" : "carriage",
        carriageNumber: extractCarriageNumber(token),
        noteNumber: extractNoteNumber(token),
      });
    }
  }

  return output;
}

function buildTrainConsistVariants(input: {
  relation: string;
  consistRaw: string;
  sequence: TrainConsistSequenceItem[];
  notes: string[];
}) {
  const validity = input.notes.filter((line) => line.startsWith("Zestawienie ważne w terminach:"));
  const sharedNotes = input.notes.filter((line) => !line.startsWith("Zestawienie ważne w terminach:"));

  if (validity.length === 0) {
    return [
      {
        relation: input.relation,
        consistRaw: input.consistRaw,
        sequence: input.sequence,
        validity: [],
        notes: sharedNotes,
      },
    ];
  }

  return validity.map((item) => ({
    relation: input.relation,
    consistRaw: input.consistRaw,
    sequence: input.sequence,
    validity: [item],
    notes: sharedNotes,
  }));
}

function splitMergedConsistToken(raw: string, width: number) {
  if (/^[1-9]{2}$/.test(raw) && width >= 12 && isLikelyMergedSingleDigitPair(raw)) {
    return raw.split("");
  }

  return [raw];
}

function isLikelyMergedSingleDigitPair(raw: string) {
  const digits = raw.split("").map((digit) => Number.parseInt(digit, 10));
  const left = digits[0];
  const right = digits[1];
  if (left === undefined || right === undefined) {
    return false;
  }

  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) === 1 && left >= 1 && right >= 1;
}

function extractCarriageNumber(value: string) {
  const clean = value.replace(/^[^0-9]+/, "");
  const noteMatch = clean.match(/^(\d+)(\d\))$/);
  if (noteMatch) {
    return noteMatch[1] ?? "";
  }

  return clean.match(/\d+/)?.[0] ?? "";
}

function extractNoteNumber(value: string) {
  return value.match(/(\d)\)$/)?.[1] ?? "";
}

function isConsistWord(text: string) {
  return /^[<>=_`}{\[\])]+$/.test(text) || /^\d{1,3}$/.test(text) || /^\d{1,3}\d\)$/.test(text) || /^\d\)$/.test(text);
}

function hasLetters(value: string) {
  return /\p{L}/u.test(value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}
