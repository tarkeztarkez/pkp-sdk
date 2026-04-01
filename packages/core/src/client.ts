const BASE_URL = "https://portalpasazera.pl";
const DEFAULT_CSP_HEADER = 'default-src "self";';

export type PortalSection =
  | "/"
  | "/Opoznienia"
  | "/Utrudnienia"
  | `/KatalogStacji/Index?stacja=${string}`;

export type Station = {
  ID: number;
  Nazwa: string;
  Iso: string;
  Key: string;
  NZ?: string;
};

type ChallengeSolver = {
  path: string;
};

export class PortalSession {
  private cookies = new Map<string, string>();
  private token = "";
  private ajaxHeaders = new Map<string, string>();
  private readonly supportsManualCookies = hasManualCookieSupport();

  async init(section: PortalSection = "/"): Promise<string> {
    const html = await this.getText(section);
    this.refreshStateFromHtml(html);
    return html;
  }

  async searchStations(query: string): Promise<Station[]> {
    const url = new URL("/Wyszukiwarka/WyszukajStacje", BASE_URL);
    url.searchParams.set("wprowadzonyTekst", query);
    url.searchParams.set("aglomeracje", "");
    url.searchParams.set("zagraniczne", "");

    const response = await this.fetch(url.toString(), {
      method: "GET",
      headers: this.buildAjaxHeaders({ includeBodyContentType: true }),
    });

    return (await this.parseJson<Station[]>(response)) ?? [];
  }

  async searchTrainNumbers(query: string): Promise<Array<{ Numer: string; Key: string }>> {
    const url = new URL("/Wyszukiwarka/WyszukajNumerPociagu", BASE_URL);
    url.searchParams.set("wprowadzonyTekst", query);

    const response = await this.fetch(url.toString(), {
      method: "GET",
      headers: this.buildAjaxHeaders({ includeBodyContentType: true }),
    });

    return (await this.parseJson<Array<{ Numer: string; Key: string }>>(response)) ?? [];
  }

  async searchRoutes(input: {
    from: Station;
    to: Station;
    date: string;
    time: string;
    departureMode: boolean;
    minChangeMinutes: number;
    direct: boolean;
  }): Promise<{ ref: string; html: string }> {
    const body = new URLSearchParams();
    body.set("kryteria[O]", String(input.departureMode));
    body.set("kryteria[SP]", String(input.from.ID));
    body.set("kryteria[SPK]", input.from.Key);
    body.set("kryteria[SK]", String(input.to.ID));
    body.set("kryteria[SKK]", input.to.Key);
    body.set("kryteria[D]", input.date);
    body.set("kryteria[G]", input.time);
    body.set("kryteria[M]", String(input.minChangeMinutes));
    body.set("kryteria[B]", String(input.direct));
    body.set("kryteria[S]", "1");

    const json = await this.postWithChallenge<{ Ref: string }>(
      "/Wyszukiwarka/WyszukajPolaczenia",
      body,
      { path: "wp" },
    );

    if (!json?.Ref) {
      throw new Error("Portal returned no route reference. Try a different date, time, or stations.");
    }

    const html = await this.getText(`/WynikiWyszukiwania?id=${encodeURIComponent(json.Ref)}`);
    return { ref: json.Ref, html };
  }

  async searchDelaysByStations(input: {
    station1Id: number;
    station2Id: number;
    departures: boolean;
  }): Promise<{ ref: string; html: string }> {
    const body = new URLSearchParams();
    body.set("stacja1", String(input.station1Id));
    body.set("stacja2", String(input.station2Id));
    body.set("odjazd", String(input.departures));

    const json = await this.postWithChallenge<{ Ref: string }>(
      "/Opoznienia/WyszukajWyniki",
      body,
      { path: "o" },
    );

    if (!json?.Ref) {
      throw new Error("Portal returned no delay reference.");
    }

    const tab = input.station2Id === -1 ? "2" : "3";
    const html = await this.getText(`/Opoznienia?s=${tab}&sid=${encodeURIComponent(json.Ref)}`);
    return { ref: json.Ref, html };
  }

  async searchDisruptions(stationId: number, dateTimestampMs: number): Promise<{ ref: string; html: string }> {
    const body = new URLSearchParams();
    body.set("stacja", String(stationId));
    body.set("data", String(dateTimestampMs));

    const json = await this.postWithChallenge<{ Ref: string }>(
      "/Utrudnienia/WyszukajWyniki",
      body,
      { path: "u" },
    );

    if (!json?.Ref) {
      throw new Error("Portal returned no disruptions reference.");
    }

    const html = await this.getText(`/Utrudnienia?sid=${encodeURIComponent(json.Ref)}`);
    return { ref: json.Ref, html };
  }

  async getStationBoard(stationName: string, departures: boolean, page = 1) {
    const stationPagePath = `/KatalogStacji/Index?stacja=${encodeURIComponent(stationName)}` as const;
    const html = await this.init(stationPagePath);
    const sid = matchSingle(html, /var sid = '([^']+)'/);

    if (!sid) {
      throw new Error(`Could not resolve station board page for "${stationName}".`);
    }

    const body = new URLSearchParams();
    body.set("sid", sid);
    body.set("odjazd", String(departures));
    body.set("p", String(page));

    const response = await this.postWithChallenge<unknown>("/KatalogStacji/WyszukajRozklad", body, {
      path: "ks",
    });

    return response;
  }

  private async postWithChallenge<T>(
    path: string,
    body: URLSearchParams,
    challenge: ChallengeSolver,
  ): Promise<T | null> {
    if (!this.token) {
      throw new Error(`Session token is missing before POST ${path}.`);
    }

    body.set("__RequestVerificationToken", this.token);

    const run = async (pow?: { nonce: string; counter: number }) => {
      const response = await this.fetch(new URL(path, BASE_URL).toString(), {
        method: "POST",
        headers: this.buildAjaxHeaders({
          includeBodyContentType: true,
          extra: pow
            ? {
                "X-POW-Nonce": pow.nonce,
                "X-POW-Counter": String(pow.counter),
              }
            : {},
        }),
        body: body.toString(),
      });

      if (
        (response.status === 401 || response.status === 428) &&
        response.headers.get("X-Require-Challenge") === "1"
      ) {
        const challengeBits = Number(response.headers.get("X-POW-Difficulty-Bits")) || 0;
        const solution = await this.solveChallenge(challenge.path, challengeBits);
        return run(solution);
      }

      return this.parseJson<T>(response);
    };

    return run();
  }

  private async solveChallenge(path: string, headerBits?: number) {
    const nonceUrl = new URL("/challenge/nonce", BASE_URL);
    nonceUrl.searchParams.set("path", path);

    const nonceResponse = await this.fetch(nonceUrl.toString(), {
      method: "GET",
      headers: this.buildAjaxHeaders({ includeBodyContentType: false }),
    });

    const challenge = await this.parseJson<{ nonce: string; uid?: string; difficultyBits?: number }>(nonceResponse);
    if (!challenge?.nonce) {
      throw new Error(`Portal requested a challenge for ${path}, but did not provide a nonce.`);
    }

    const difficultyBits = headerBits || Number(challenge.difficultyBits) || 0;
    if (!difficultyBits) {
      throw new Error(`Portal challenge for ${path} did not include a valid difficulty.`);
    }

    const uid = challenge.uid || this.cookies.get("uid") || "nouid";
    const encoder = new TextEncoder();

    for (let counter = 0; ; counter++) {
      const message = encoder.encode(`${challenge.nonce}|${uid}|${counter}`);
      const digest = await crypto.subtle.digest("SHA-256", message);
      if (hasLeadingZeroBits(new Uint8Array(digest), difficultyBits)) {
        return { nonce: challenge.nonce, counter };
      }
    }
  }

  private buildAjaxHeaders(options: {
    includeBodyContentType: boolean;
    extra?: Record<string, string>;
  }): Headers {
    const headers = new Headers();

    headers.set("Accept", "application/json, text/javascript, */*; q=0.01");
    headers.set("X-Requested-With", "XMLHttpRequest");
    headers.set("X-Content-Security-PoIicy", DEFAULT_CSP_HEADER);

    if (options.includeBodyContentType) {
      headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    }

    for (const [key, value] of this.ajaxHeaders) {
      headers.set(key, value);
    }

    if (this.token) {
      headers.set("__RequestVerificationToken", this.token);
    }

    if (options.extra) {
      for (const [key, value] of Object.entries(options.extra)) {
        headers.set(key, value);
      }
    }

    const cookieHeader = this.serializeCookies();
    if (this.supportsManualCookies && cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }

    return headers;
  }

  private async getText(pathOrUrl: string): Promise<string> {
    const response = await this.fetch(
      pathOrUrl.startsWith("http") ? pathOrUrl : new URL(pathOrUrl, BASE_URL).toString(),
      {
        method: "GET",
        headers: this.buildAjaxHeaders({ includeBodyContentType: false }),
      },
    );

    const html = await response.text();
    this.refreshStateFromHtml(html);
    return html;
  }

  private async fetch(input: string, init: RequestInit): Promise<Response> {
    const response = await fetch(input, {
      ...init,
      credentials: "include",
    });
    this.captureCookies(response);
    return response;
  }

  private captureCookies(response: Response) {
    if (!this.supportsManualCookies) {
      return;
    }

    const setCookies = response.headers.getSetCookie?.() ?? [];

    for (const cookie of setCookies) {
      const pair = cookie.split(";", 1)[0];
      if (!pair) {
        continue;
      }
      const eqIndex = pair.indexOf("=");
      if (eqIndex <= 0) {
        continue;
      }

      const name = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      this.cookies.set(name, value);
    }
  }

  private refreshStateFromHtml(html: string) {
    const token = matchSingle(
      html,
      /name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/,
    );

    if (token) {
      this.token = token;
    }

    for (const match of html.matchAll(/'([0-9a-f]{6})': '([0-9a-f]{6})'/g)) {
      const key = match[1];
      const value = match[2];
      if (key && value) {
        this.ajaxHeaders.set(key, value);
      }
    }
  }

  private serializeCookies(): string {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  private async parseJson<T>(response: Response): Promise<T | null> {
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Expected JSON from ${response.url}, received non-JSON content.`);
    }
  }
}

function hasLeadingZeroBits(bytes: Uint8Array, bits: number) {
  const fullBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;

  for (let index = 0; index < fullBytes; index++) {
    if (bytes[index] !== 0) {
      return false;
    }
  }

  if (remainingBits === 0) {
    return true;
  }

  const mask = 0xff << (8 - remainingBits);
  return ((bytes[fullBytes] ?? 0) & mask) === 0;
}

function matchSingle(source: string, pattern: RegExp) {
  return pattern.exec(source)?.[1] ?? "";
}

function hasManualCookieSupport() {
  try {
    return typeof new Headers().getSetCookie === "function";
  } catch {
    return false;
  }
}
