# pkp cli

CLI for `portalpasazera.pl`, built with Bun and TypeScript.

Examples:

```bash
bun run index.ts stations "Warszawa"
bun run index.ts stations "Warszawa" --json
bun run index.ts route --from "Warszawa Centralna" --to "Kraków Główny"
bun run index.ts route --from "Warszawa Centralna" --to "Kraków Główny" --grm --json
bun run index.ts route --from "Warszawa Centralna" --to "Kraków Główny" --grm --carriage-svg 8 --json
bun run index.ts routes --from "Warszawa Centralna" --to "Kraków Główny"
bun run index.ts routes --from "Warszawa Centralna" --to "Kraków Główny" --json
bun run index.ts departures "Warszawa Centralna"
bun run index.ts arrivals "Warszawa Centralna"
bun run index.ts delays --from "Warszawa Centralna" --to "Kraków Główny"
bun run index.ts disruptions --station "Warszawa Centralna"
bun run index.ts server serve --port 3000
```

All commands support `--json` for machine-readable output. Without it, the CLI prints a human-readable summary.

`route` behaves like `routes`, but returns only the first matching route. Add `--grm` to attach Bilkom GRM train/carriage data. Add `--carriage-svg <number>` to include the SVG layout for a specific carriage; this implies `--grm`.

`routes` enriches Portal Pasażera route results with best-effort Bilkom ticket pricing. When Bilkom cannot match a route, price fields are returned as `null` in JSON and shown as `N/A` in text output.

## REST API

Start the local server:

```bash
pkp server serve --host 127.0.0.1 --port 3000
```

Available endpoints:

- `GET /stations?query=Warszawa`
- `GET /train-numbers?query=IC`
- `GET /route?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny`
- `GET /route?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny&grm=true`
- `GET /route?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny&carriageSvg=8`
- `GET /routes?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny`
- `GET /departures?station=Warszawa%20Centralna`
- `GET /arrivals?station=Warszawa%20Centralna`
- `GET /delays?station=Warszawa%20Centralna`
- `GET /delays?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny`
- `GET /disruptions?station=Warszawa%20Centralna`
- `GET /openapi.json`

The server enables permissive CORS and exposes an OpenAPI 3.1 document at `/openapi.json`.

## Docker

Build the image:

```bash
docker build -t pkp-cli .
```

Run the REST server:

```bash
docker run --rm -p 3000:3000 pkp-cli
```

Then use:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/openapi.json`

The container starts `pkp server serve --host 0.0.0.0 --port 3000` by default.

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
