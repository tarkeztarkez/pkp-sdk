# pkp-sdk monorepo

Monorepo for querying `portalpasazera.pl`, split into focused packages:

- `@pkp-sdk/core`: portable domain logic, scraping, parsing, normalization, and service functions
- `@pkp-sdk/api`: Bun-only HTTP server on top of `core`
- `@pkp-sdk/cli`: Bun-only CLI on top of `core`
- `pkp-sdk`: portable npm-facing TypeScript SDK built on top of `core`

## Workspace

Install dependencies:

```bash
bun install
```

Run workspace checks:

```bash
bun run typecheck
bun run test
bun run build
```

## CLI

Run the Bun CLI package:

```bash
bun run --filter @pkp-sdk/cli start -- stations "Warszawa"
bun run --filter @pkp-sdk/cli start -- stations "Warszawa" --json
bun run --filter @pkp-sdk/cli start -- route --from "Warszawa Centralna" --to "Kraków Główny"
bun run --filter @pkp-sdk/cli start -- route --from "Warszawa Centralna" --to "Kraków Główny" --grm --json
bun run --filter @pkp-sdk/cli start -- route --from "Warszawa Centralna" --to "Kraków Główny" --grm --carriage-svg 8 --json
bun run --filter @pkp-sdk/cli start -- routes --from "Warszawa Centralna" --to "Kraków Główny"
bun run --filter @pkp-sdk/cli start -- departures "Warszawa Centralna"
bun run --filter @pkp-sdk/cli start -- arrivals "Warszawa Centralna"
bun run --filter @pkp-sdk/cli start -- delays --from "Warszawa Centralna" --to "Kraków Główny"
bun run --filter @pkp-sdk/cli start -- disruptions --station "Warszawa Centralna"
bun run --filter @pkp-sdk/cli start -- server serve --port 3000
```

All commands support `--json` for machine-readable output. `route` returns the first matching route. `--grm` attaches Bilkom GRM data. `--carriage-svg <number>` implies `--grm`.

## API

Run the Bun API package:

```bash
bun run --filter @pkp-sdk/api start --host 127.0.0.1 --port 3000
```

Endpoints:

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

## TypeScript SDK

`pkp-sdk` is the npm-facing package. It exposes both direct functions and a thin `PkpSdk` wrapper:

```ts
import { PkpSdk, searchStations } from "pkp-sdk";

const sdk = new PkpSdk();
const stations = await sdk.searchStations("Warszawa");
const sameResult = await searchStations("Warszawa");
```

## Docker

Build the image:

```bash
docker build -t pkp-sdk .
```

Run the API server:

```bash
docker run --rm -p 3000:3000 pkp-sdk
```

The container starts `@pkp-sdk/api` on `0.0.0.0:3000`.
