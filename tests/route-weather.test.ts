import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("route-weather concurrent requests", () => {
  test("fetches route weather with chunked concurrency", async () => {
    const { routeGrids, getRouteUltraSrtFcsts } = await import("../src/lib/kma.ts");

    const origServiceKey = process.env.KMA_SERVICE_KEY;
    const origFetch = globalThis.fetch;
    process.env.KMA_SERVICE_KEY = "test-key";

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      // simulate network delay
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;

      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: {
              items: {
                item: [
                  { category: "PTY", fcstDate: "20260722", fcstTime: "1800", fcstValue: "1" },
                  { category: "PTY", fcstDate: "20260722", fcstTime: "1900", fcstValue: "0" },
                ],
              },
            },
          },
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      const grids = routeGrids({ lat: 37.5665, lng: 126.9780 }, { lat: 35.1796, lng: 129.0756 });
      const forecasts = await getRouteUltraSrtFcsts(grids);

      assert.ok(grids.length > 10, "Should have more than 10 grids");
      assert.ok(forecasts.length === grids.length, "Should return forecasts for each grid");

      // Because we chunk by 5 in kma.ts, maxConcurrent should be <= 5
      assert.ok(maxConcurrent <= 5, `Max concurrency was ${maxConcurrent}, expected <= 5`);
    } finally {
      globalThis.fetch = origFetch;
      if (origServiceKey === undefined) delete process.env.KMA_SERVICE_KEY;
      else process.env.KMA_SERVICE_KEY = origServiceKey;
    }
  });
});
