# Route Reference

Use this file for `route`, including pricing, GRM, carriage SVG, and JSON output.

## Command

```bash
route --from <station> --to <station> [--date DD.MM.YYYY] [--time HH:MM] [--arrival] [--min-change N] [--direct] [--discount PERCENT] [--max-price PLN] [--grm] [--carriage-svg N] [--json]
```

## Defaults and behavior

- `route` returns the first matching result from `routes`.
- `route` defaults to today's local date and the current local time rounded by the CLI.
- `route` uses departure mode by default. Add `--arrival` to switch to arrive-by mode.
- `route --min-change` defaults to `3`.
- `route --discount` defaults to `0`.
- Unless the user overrides them, use `--discount 51` and `--min-change 10`.
- Do not ask the user to confirm those route-search defaults before searching.
- `route --max-price` filters out only routes with a known total price above the limit before picking the first result. Routes with unknown price still remain eligible.
- Route prices are best-effort. Missing price data is not a hard failure.
- When `--discount` is used, `ticketPrice` and human-readable output show only the discounted price.
- Dates must use `DD.MM.YYYY`.
- Times must use `HH:MM`.
- Missing required flags or bad date/time formats cause an error on stderr and exit code `1`.

## Pricing and links

`route` enriches the returned route with ticket pricing when it can be matched.

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

## GRM and carriage SVG

Use `route` when you need train composition details.

- `--grm` adds a `grm` object with train composition, carriage metadata, vehicle data, and stops.
- `--carriage-svg N` fetches the SVG layout for carriage `N` and includes it as `carriageSvg`.

Typical patterns:

```bash
pkp route --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --grm --json
pkp route --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --carriage-svg 8 --json
```

## JSON usage

Prefer `--json` whenever output will be parsed by another tool, another agent, or a script.

General rules:

- JSON is printed with indentation.
- `route` includes a `ref` field from the upstream service.
- Relative detail links are normalized into absolute URLs in JSON output.
- If a workflow depends on stable station identity, resolve the station first with `pkp stations "<query>" --json`.

Typical patterns:

```bash
pkp route --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --json
pkp route --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --grm --json
pkp route --from "Warszawa Centralna" --to "Kraków Główny" --min-change 10 --discount 51 --grm --json | jq '.grm.carriages[] | {carriageNumber, status}'
```

## JSON shape

### `route --json`

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
  "route": {
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
  },
  "grm": {
    "trainComposition": {
      "wagony": [1, 2, 3],
      "wagonyNiedostepne": []
    },
    "carriages": [
      {
        "carriageNumber": 8,
        "schema": "...",
        "status": "...",
        "spots": []
      }
    ],
    "vehicle": {},
    "stops": []
  },
  "carriageSvg": "<svg>...</svg>"
}
```

## Practical guidance

- Always disclose the applied route-search assumptions in the final output.
- If an infographic is generated, include the assumptions inside the infographic.
- If no infographic is generated, include the assumptions in the text response near the query context.
- When you need pricing, inspect the `ticketPrice*` fields.
- When you need train composition or a carriage diagram, use `--grm` or `--carriage-svg`.
- When you need a deep link back to portalpasazera.pl, read `detailsUrl`.
