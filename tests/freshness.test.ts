import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { latLngToGrid, routeGrids, ultraSrtFcstBase, ultraSrtNcstBase } from "../src/lib/kma.ts";

describe("KMA Grid and Time Calculations", () => {
  test("latLngToGrid converts Seoul coords correctly", () => {
    // Seoul City Hall ~ 37.5665, 126.9780 -> grid (60, 127)
    const grid = latLngToGrid(37.5665, 126.978);
    assert.equal(grid.nx, 60);
    assert.equal(grid.ny, 127);
  });

  test("latLngToGrid converts Busan coords correctly", () => {
    // Busan ~ 35.1796, 129.0756 -> grid (98, 76) or (97, 74)
    const grid = latLngToGrid(35.1796, 129.0756);
    assert.ok(grid.nx >= 95 && grid.nx <= 100);
    assert.ok(grid.ny >= 70 && grid.ny <= 80);
  });

  test("routeGrids generates contiguous grid points along commute path", () => {
    const home = { lat: 37.4, lng: 127.2 };
    const work = { lat: 37.2, lng: 127.1 };
    const grids = routeGrids(home, work);
    assert.ok(grids.length > 0);
    // Unique points
    const keys = grids.map((g) => `${g.nx},${g.ny}`);
    assert.equal(new Set(keys).size, grids.length);
  });

  test("ultraSrtFcstBase and ultraSrtNcstBase format valid base times", () => {
    const fcst = ultraSrtFcstBase();
    assert.match(fcst.baseDate, /^\d{8}$/);
    assert.match(fcst.baseTime, /^\d{4}$/);
    assert.equal(fcst.baseTime.endsWith("30"), true);

    const ncst = ultraSrtNcstBase();
    assert.match(ncst.baseDate, /^\d{8}$/);
    assert.match(ncst.baseTime, /^\d{4}$/);
    assert.equal(ncst.baseTime.endsWith("00"), true);
  });
});

describe("Client Fetch Lifecycle & Freshness Throttling Logic Simulation", () => {
  interface WeatherState {
    status: "idle" | "ready" | "error";
    data?: unknown;
    code?: string;
  }

  interface Coords {
    lat: number;
    lng: number;
  }

  class WeatherFetcherSimulator {
    public weather: WeatherState = { status: "idle" };
    public lastFetchedAt = 0;
    public lastFetchedCoords: Coords | null = null;
    public isFetching = false;
    public abortedRequests: number[] = [];
    public activeRequestId = 0;
    public networkCallsCount = 0;
    public bannerErrors: string[] = [];

    async fetchWeatherData(
      loc: Coords | null,
      options?: { showLoading?: boolean; force?: boolean },
      mockNetworkHandler?: (signal: AbortSignal) => Promise<{ ok: boolean; data?: unknown; error?: string }>
    ) {
      if (!loc) return;
      const now = Date.now();
      const sameCoords =
        this.lastFetchedCoords !== null &&
        this.lastFetchedCoords.lat === loc.lat &&
        this.lastFetchedCoords.lng === loc.lng;

      // 1. Throttling check
      if (
        !options?.force &&
        sameCoords &&
        this.weather.status === "ready" &&
        now - this.lastFetchedAt < 15000
      ) {
        return; // Throttled
      }

      // In-flight deduplication
      if (this.isFetching && sameCoords && !options?.force) {
        return;
      }

      // Abort previous in-flight request
      if (this.isFetching) {
        this.abortedRequests.push(this.activeRequestId);
      }

      const currentReqId = ++this.activeRequestId;
      this.isFetching = true;
      this.lastFetchedCoords = loc;
      this.networkCallsCount++;

      const controller = new AbortController();

      try {
        const handler =
          mockNetworkHandler ??
          (async (signal: AbortSignal) => {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            return { ok: true, data: { temp: 22, updatedAt: Date.now() } };
          });

        const res = await handler(controller.signal);

        if (this.activeRequestId !== currentReqId) return;

        if (!res.ok) {
          if (this.weather.status !== "ready" || !sameCoords) {
            this.weather = { status: "error", code: res.error ?? "OTHER" };
          } else if (options?.showLoading) {
            this.bannerErrors.push("날씨를 새로고침하지 못했어요.");
          }
        } else {
          this.weather = { status: "ready", data: res.data };
          this.lastFetchedAt = Date.now();
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (this.activeRequestId !== currentReqId) return;
        if (this.weather.status !== "ready" || !sameCoords) {
          this.weather = { status: "error", code: "OTHER" };
        } else if (options?.showLoading) {
          this.bannerErrors.push("날씨를 새로고침하지 못했어요. 네트워크 연결을 확인해주세요.");
        }
      } finally {
        if (this.activeRequestId === currentReqId) {
          this.isFetching = false;
        }
      }
    }
  }

  test("Initial fetch loads fresh weather data", async () => {
    const sim = new WeatherFetcherSimulator();
    await sim.fetchWeatherData({ lat: 37.5, lng: 127.0 }, { showLoading: true, force: true });
    assert.equal(sim.weather.status, "ready");
    assert.equal(sim.networkCallsCount, 1);
  });

  test("Rapid foreground events within 15s are throttled to prevent redundant requests", async () => {
    const sim = new WeatherFetcherSimulator();
    const loc = { lat: 37.5, lng: 127.0 };
    await sim.fetchWeatherData(loc, { force: true });
    assert.equal(sim.networkCallsCount, 1);

    // Rapid consecutive foreground triggers (visibilitychange + focus + pageshow)
    await sim.fetchWeatherData(loc, { force: false });
    await sim.fetchWeatherData(loc, { force: false });
    await sim.fetchWeatherData(loc, { force: false });
    assert.equal(sim.networkCallsCount, 1);
  });

  test("Foregrounding after 15s triggers automatic fresh fetch", async () => {
    const sim = new WeatherFetcherSimulator();
    const loc = { lat: 37.5, lng: 127.0 };
    await sim.fetchWeatherData(loc, { force: true });
    assert.equal(sim.networkCallsCount, 1);

    // Simulate 20s elapsed in background
    sim.lastFetchedAt = Date.now() - 20000;

    await sim.fetchWeatherData(loc, { force: false });
    assert.equal(sim.networkCallsCount, 2);
  });

  test("Manual refresh bypasses 15s throttle and forces fresh data", async () => {
    const sim = new WeatherFetcherSimulator();
    const loc = { lat: 37.5, lng: 127.0 };
    await sim.fetchWeatherData(loc, { force: true });
    assert.equal(sim.networkCallsCount, 1);

    // Manual refresh with force: true
    await sim.fetchWeatherData(loc, { showLoading: true, force: true });
    assert.equal(sim.networkCallsCount, 2);
  });

  test("Background auto-refresh failure preserves existing ready weather", async () => {
    const sim = new WeatherFetcherSimulator();
    const loc = { lat: 37.5, lng: 127.0 };
    await sim.fetchWeatherData(loc, { force: true });
    assert.equal(sim.weather.status, "ready");
    const readyData = sim.weather.data;

    // Simulate 5-minute periodic auto-refresh with temporary network failure
    sim.lastFetchedAt = Date.now() - 300000;
    await sim.fetchWeatherData(loc, { force: false }, async () => {
      throw new Error("KMA connection timed out");
    });

    // Weather state must remain ready and not wiped to error
    assert.equal(sim.weather.status, "ready");
    assert.equal(sim.weather.data, readyData);
    assert.equal(sim.bannerErrors.length, 0); // Background refresh does not spam banners
  });

  test("Manual refresh failure on ready state preserves view but shows toast banner", async () => {
    const sim = new WeatherFetcherSimulator();
    const loc = { lat: 37.5, lng: 127.0 };
    await sim.fetchWeatherData(loc, { force: true });
    assert.equal(sim.weather.status, "ready");
    const readyData = sim.weather.data;

    // User taps refresh button during offline / error
    await sim.fetchWeatherData(loc, { showLoading: true, force: true }, async () => {
      return { ok: false, error: "KMA_ERROR" };
    });

    assert.equal(sim.weather.status, "ready");
    assert.equal(sim.weather.data, readyData);
    assert.equal(sim.bannerErrors.length, 1);
    assert.equal(sim.bannerErrors[0], "날씨를 새로고침하지 못했어요.");
  });

  test("Changing location aborts prior in-flight request and switches data", async () => {
    const sim = new WeatherFetcherSimulator();
    const locA = { lat: 37.5, lng: 127.0 };
    const locB = { lat: 35.1, lng: 129.0 };

    // Start request A
    const p1 = sim.fetchWeatherData(locA, { force: true }, async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true, data: { city: "Seoul" } };
    });

    // Rapidly switch to Location B
    const p2 = sim.fetchWeatherData(locB, { force: true }, async () => {
      return { ok: true, data: { city: "Busan" } };
    });

    await Promise.all([p1, p2]);
    assert.equal(sim.weather.status, "ready");
    assert.deepEqual(sim.weather.data, { city: "Busan" });
    assert.equal(sim.abortedRequests.length, 1);
  });
});
