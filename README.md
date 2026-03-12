# pkp cli

CLI for `portalpasazera.pl`, built with Bun and TypeScript.

Examples:

```bash
bun run index.ts stations "Warszawa"
bun run index.ts stations "Warszawa" --json
bun run index.ts routes --from "Warszawa Centralna" --to "Kraków Główny"
bun run index.ts routes --from "Warszawa Centralna" --to "Kraków Główny" --json
bun run index.ts train-consists "1510" --station "Warszawa Centralna"
bun run index.ts departures "Warszawa Centralna"
bun run index.ts arrivals "Warszawa Centralna"
bun run index.ts delays --from "Warszawa Centralna" --to "Kraków Główny"
bun run index.ts disruptions --station "Warszawa Centralna"
bun run index.ts server serve --port 3000
```

All commands support `--json` for machine-readable output. Without it, the CLI prints a human-readable summary.

## REST API

Start the local server:

```bash
pkp server serve --host 127.0.0.1 --port 3000
```

Available endpoints:

- `GET /stations?query=Warszawa`
- `GET /train-numbers?query=IC`
- `GET /routes?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny`
- `GET /departures?station=Warszawa%20Centralna`
- `GET /arrivals?station=Warszawa%20Centralna`
- `GET /delays?station=Warszawa%20Centralna`
- `GET /delays?from=Warszawa%20Centralna&to=Krak%C3%B3w%20G%C5%82%C3%B3wny`
- `GET /disruptions?station=Warszawa%20Centralna`
- `GET /train-consists?station=Warszawa%20Centralna&train=1510`
- `GET /openapi.json`

The server enables permissive CORS and exposes an OpenAPI 3.1 document at `/openapi.json`.

## Intercity Train Consists

`train-consists` uses the public PKP Intercity station PDF list at `zestawienia-pociagow.html`, downloads the matching station PDF, runs `pdftotext -tsv`, and returns parsed train consist data instead of a raw PDF link.

The response shape groups results into train matches with nested `variants`, so a single train block can expose multiple possible zestawienia with separate validity notes, diagram lines, and left-to-right carriage sequences.

This feature requires the `pdftotext` binary to be installed on the system.

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
