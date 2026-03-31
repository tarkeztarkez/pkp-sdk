import { describe, expect, test } from "bun:test";
import { startServer } from "./server";

describe("server openapi", () => {
  test("documents the route price fields", async () => {
    const port = 32123;
    const server = startServer({ host: "127.0.0.1", port });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      const json = (await response.json()) as any;
      const routeSchema = json.components.schemas.Route;

      expect(routeSchema.properties.ticketPrice.type).toEqual(["number", "null"]);
      expect(routeSchema.properties.ticketPriceCurrency.enum).toEqual(["PLN", null]);
      expect(routeSchema.properties.ticketPriceSource.enum).toEqual(["bilkom", null]);
      expect(routeSchema.required).toContain("ticketPriceAvailable");
    } finally {
      server.stop(true);
    }
  });

  test("documents the singular route endpoint and GRM fields", async () => {
    const port = 32124;
    const server = startServer({ host: "127.0.0.1", port });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      const json = (await response.json()) as any;
      const routePath = json.paths["/route"]?.get;
      const routeResponseSchema = json.components.schemas.RouteResponse;
      const routeGrmSchema = json.components.schemas.RouteGrm;

      expect(routePath).toBeTruthy();
      expect(routePath.parameters.some((item: any) => item.name === "grm")).toBe(true);
      expect(routePath.parameters.some((item: any) => item.name === "carriageSvg")).toBe(true);
      expect(routePath.responses["404"]).toBeTruthy();
      expect(routeResponseSchema.properties.route.$ref).toBe("#/components/schemas/Route");
      expect(routeResponseSchema.properties.grm.oneOf[0].$ref).toBe("#/components/schemas/RouteGrm");
      expect(routeResponseSchema.properties.carriageSvg.oneOf[0].type).toBe("string");
      expect(routeGrmSchema.properties.trainComposition.$ref).toBe("#/components/schemas/GrmTrainComposition");
    } finally {
      server.stop(true);
    }
  });
});
