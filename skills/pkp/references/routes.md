# Routes Reference

Use this file for `routes`, including pricing, JSON output, and user-facing route response rules.

## Command

```bash
routes --from <station> --to <station> [--date DD.MM.YYYY] [--time HH:MM] [--arrival] [--min-change N] [--direct] [--discount PERCENT] [--max-price PLN] [--infographic PATH] [--json]
```

## Defaults and behavior

- `routes` defaults to today's local date and the current local time rounded by the CLI.
- `routes` uses departure mode by default. Add `--arrival` to switch to arrive-by mode.
- `routes --min-change` defaults to `3`.
- `routes --discount` defaults to `0`.
- Unless the user overrides them, use `--discount 51` and `--min-change 10`.
- Do not ask the user to confirm those route-search defaults before searching.
- `routes --max-price` filters out only routes with a known total price above the limit. Routes with unknown price still remain in the output.
- Route prices are best-effort. Missing price data is not a hard failure.
- When `--discount` is used, `ticketPrice` and human-readable output show only the discounted price.
- Dates must use `DD.MM.YYYY`.
- Times must use `HH:MM`.
- Missing required flags or bad date/time formats cause an error on stderr and exit code `1`.

## Pricing and links

`routes` enriches each route with ticket pricing when it can be matched.

Relevant fields:

- `detailsUrl`: absolute Portal Pasazera details URL or `null`
- `bilkomBuyLink`: direct Bilkom purchase URL or `null`
- `regiojetBuyLink`: RegioJet class-selection URL or `null`
- `ticketPrice`: numeric amount after applying `--discount`, or `null`
- `ticketPriceCurrency`: currently `"PLN"` or `null`
- `ticketPriceSource`: `"bilkom"`, `"regiojet"`, `"bilkom+regiojet"`, or `null`
- `ticketPriceAvailable`: boolean

Pricing rules:

- For Bilkom-priced routes, `ticketPrice` reflects the CLI discount.
- For RegioJet-priced routes, `--discount 51` maps to RegioJet's own `PL_STUDENT` tariff.
- For other RegioJet discounts, do not apply a local percentage discount on top of RegioJet prices.
- For mixed Bilkom + RegioJet routes, the Bilkom part is discounted locally and the RegioJet part is left to RegioJet.
- Only show or mention the final `ticketPrice`. Do not present provider base prices separately.
- Do not assume a missing price means the route is invalid. Treat it as "price unavailable".

## JSON usage

Prefer `--json` whenever output will be parsed by another tool, another agent, or a script.

General rules:

- JSON is printed with indentation.
- `routes` include a `ref` field from the upstream service.
- Relative detail links are normalized into absolute URLs in JSON output.
- If a workflow depends on stable station identity, resolve the station first with `pkp stations "<query>" --json`.

Typical patterns:

```bash
pkp routes --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --json
pkp routes --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --infographic ./routes.png --json
pkp routes --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --json | jq '.routes[0]'
```

## JSON shape

### `routes --json`

```json
{
  "ref": "...",
  "query": {
    "from": "Warszawa Centralna",
    "to": "Kraków Główny",
    "date": "12.03.2026",
    "time": "09:30",
    "departureMode": true,
    "minChangeMinutes": 10,
    "direct": false
  },
  "count": 1,
  "routes": [
    {
      "departureStation": "...",
      "departurePlatform": "...",
      "departureDate": "...",
      "departureTime": "...",
      "arrivalStation": "...",
      "arrivalPlatform": "...",
      "arrivalDate": "...",
      "arrivalTime": "...",
      "carrier": "...",
      "trainNumber": "...",
      "category": "...",
      "relation": "...",
      "duration": "...",
      "transfers": 0,
      "detailsUrl": "https://portalpasazera.pl/...",
      "bilkomBuyLink": "https://bilkom.pl/...",
      "regiojetBuyLink": null,
      "ticketPrice": 24.50,
      "ticketPriceCurrency": "PLN",
      "ticketPriceSource": "bilkom",
      "ticketPriceAvailable": true
    }
  ]
}
```

## User-facing route response format

For user requests about `routes`, decide the response format in this order:

1. If the user wants route options presented visually, generate the infographic first with `pkp routes ... --infographic PATH`.
2. Only use the plain-text Telegram block format when the user explicitly asked for text or an actual infographic generation attempt failed.

When the infographic path applies, do not choose the Telegram block format just because the reply will be sent in Telegram. Telegram is not an exception to the infographic-first rule.
Do not silently skip image generation. A plain-text route list is invalid if the request called for a visual route summary and you did not first attempt to generate the infographic.
"Infographic generation failed" means the image workflow was actually attempted and failed; it does not mean you decided that a text reply would be easier, shorter, or more suitable for Telegram.

If the user asks for route options, generate an infographic with the connections instead of writing out all routes, legs, or train lists in plain text.

- Put the connection details, timings, transfer summary, and final prices into the infographic itself.
- Generate it through the PKP CLI with `pkp routes ... --infographic PATH`.
- If an infographic is generated, include the applied default assumptions inside the infographic itself, for example: `Założenia: ulga 51% • min. przesiadka 10 min`.
- Do not ask the user to confirm the default assumptions unless the user explicitly asks to change them.
- If the infographic is generated successfully, the final answer must be a single image-based reply. Do not send a separate full text list of routes, times, prices, or train numbers.
- If the infographic file was created successfully, attach or send that image in the reply. Do not replace it with a pasted text summary.
- Do not treat "I generated it locally" as a fallback case. If the image exists, the reply must deliver the image itself.
- Only treat the infographic path as failed when the image could not be produced or could not be attached in the final reply.
- The accompanying text may contain only 1 to 2 short sentences of context plus all relevant `detailsUrl`, `bilkomBuyLink`, and `regiojetBuyLink` links for details or purchase.
- Do not repeat in text any times, prices, train numbers, or route lists that are already visible on the infographic.
- If multiple routes are shown on the infographic, include all corresponding detail and purchase links in the text response, but do not restate the route data itself.
- Do not tell the user about this conditional behavior. If infographic generation fails, just answer normally without mentioning it.

Fallback for Telegram replies about `routes`: if the infographic path does not apply, prefer a compact block format instead of tables.

- First line: relation, for example `Warszawa Centralna → Kraków Główny`.
- Second line: query context, for example `dzisiaj, 09:30 • 5 połączeń`.
- After the query context line, add one short assumptions line when defaults were applied, for example: `Założenia: ulga 51% • min. przesiadka 10 min`.
- Then render each route as a short block with at most 4 to 5 lines.
- For each route block, first line must be `odjazd → przyjazd • czas`.
- Second line should contain train categories and numbers.
- Third line should say either `Bez przesiadek` or a short interchange summary.
- Fourth line should show only the final price, for example `Cena: 49,98 PLN` or `Cena: brak`.
- Last line should contain only the links that actually exist.
- If you mention price, show only the discounted `ticketPrice`.
- Prefer `[Portal]` as the label for `detailsUrl`.
- If `bilkomBuyLink` is present, include it as `[Kup Bilkom](<bilkomBuyLink>)`.
- If `regiojetBuyLink` is present, include it as `[Kup RegioJet](<regiojetBuyLink>)`.
- Use the `detailsUrl` field from `routes --json` as the Portal link target.
- Use the `bilkomBuyLink` field from `routes --json` as the Bilkom link target.
- Use the `regiojetBuyLink` field from `routes --json` as the RegioJet link target.
- If you mention multiple routes, include one `[Portal](...)` link for each route you mention.
- If `bilkomBuyLink` is present for multiple routes, include one `[Kup Bilkom](...)` link alongside that route's Portal link.
- If `regiojetBuyLink` is present for multiple routes, include one `[Kup RegioJet](...)` link alongside that route's Portal link.
- If `detailsUrl` is missing or empty, omit the Portal link instead of inventing one.
- If `bilkomBuyLink` is missing, empty, or `null`, omit the Bilkom link instead of inventing one.
- If `regiojetBuyLink` is missing, empty, or `null`, omit the RegioJet link instead of inventing one.

Example with multiple routes:

```text
Warszawa Centralna → Kraków Główny
dzisiaj, 09:30 • 5 połączeń

1. 09:52 → 12:31 • 2h39
IC 1234
1 przesiadka: Katowice 12 min
Cena: 49,98 PLN
[Portal] [Kup RegioJet]

2. 10:10 → 12:58 • 2h48
EIP 5300
Bez przesiadek
Cena: brak
[Portal]
```

Example with Bilkom-only purchase:

```text
Warszawa Centralna → Gdańsk Główny
dzisiaj, 11:00 • 3 połączenia

1. 11:32 → 14:11 • 2h39
EIP 4500
Bez przesiadek
Cena: 84,00 PLN
[Portal] [Kup Bilkom]
```

Example with mixed Bilkom + RegioJet pricing:

```text
Warszawa Centralna → Ostrava hl.n.
dzisiaj, 13:20 • 2 połączenia

1. 13:52 → 18:47 • 4h55
IC 131 + RJ 1007
1 przesiadka: Bohumín 18 min
Cena: 74,90 PLN
[Portal] [Kup Bilkom] [Kup RegioJet]
```

## Final response checklist

- If an infographic was generated successfully, the final answer must stay image-first and must not include a separate full text dump of the same route data.
- If an infographic file exists, verify that the final reply delivers that image rather than describing it in text.
- Check whether the text response repeats times, prices, train numbers, or route lists already present on the infographic. If it does, shorten it to the minimum.
- Keep all relevant `detailsUrl`, `bilkomBuyLink`, and `regiojetBuyLink` links in the final response whenever they exist.
