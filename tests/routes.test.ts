import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname, "../src/app/api");

describe("API Route Config & Headers Verification", () => {
  const routes = [
    "weather/route.ts",
    "cloudmap/route.ts",
    "route-weather/route.ts",
    "subscribe/route.ts",
    "push-status/route.ts",
    "test-push/route.ts",
    "cron/weather/route.ts",
  ];

  for (const route of routes) {
    test(`api/${route} explicitly declares dynamic and revalidate = 0`, () => {
      const filePath = path.join(SRC_DIR, route);
      assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
      const content = fs.readFileSync(filePath, "utf-8");

      assert.match(
        content,
        /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/,
        `${route} must export dynamic = 'force-dynamic'`
      );
      assert.match(
        content,
        /export\s+const\s+revalidate\s*=\s*0/,
        `${route} must export revalidate = 0`
      );
    });
  }

  test("next.config.ts configures no-store/no-cache headers for all /api/:path*", () => {
    const nextConfigPath = path.resolve(import.meta.dirname, "../next.config.ts");
    const content = fs.readFileSync(nextConfigPath, "utf-8");

    assert.match(content, /source:\s*["']\/api\/:path\*["']/);
    assert.match(content, /no-store,\s*no-cache/);
    assert.match(content, /source:\s*["']\/sw\.js["']/);
  });

  test("src/app/page.tsx has visibility, focus, pageshow, and online foreground listeners", () => {
    const pagePath = path.resolve(import.meta.dirname, "../src/app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    assert.match(content, /document\.addEventListener\(["']visibilitychange["']/);
    assert.match(content, /window\.addEventListener\(["']focus["']/);
    assert.match(content, /window\.addEventListener\(["']pageshow["']/);
    assert.match(content, /window\.addEventListener\(["']online["']/);
  });

  test("src/components/CloudMap.tsx and RouteTimeline.tsx have complete lifecycle listeners", () => {
    const cloudMap = fs.readFileSync(path.resolve(import.meta.dirname, "../src/components/CloudMap.tsx"), "utf-8");
    assert.match(cloudMap, /document\.addEventListener\(["']visibilitychange["']/);
    assert.match(cloudMap, /window\.addEventListener\(["']focus["']/);
    assert.match(cloudMap, /window\.addEventListener\(["']pageshow["']/);
    assert.match(cloudMap, /window\.addEventListener\(["']online["']/);

    const routeTimeline = fs.readFileSync(path.resolve(import.meta.dirname, "../src/components/RouteTimeline.tsx"), "utf-8");
    assert.match(routeTimeline, /document\.addEventListener\(["']visibilitychange["']/);
    assert.match(routeTimeline, /window\.addEventListener\(["']focus["']/);
    assert.match(routeTimeline, /window\.addEventListener\(["']pageshow["']/);
    assert.match(routeTimeline, /window\.addEventListener\(["']online["']/);
  });

  test("api/push-status checks cooldown using actual grid coordinates instead of literal 'current'", () => {
    const pushStatus = fs.readFileSync(path.join(SRC_DIR, "push-status/route.ts"), "utf-8");
    assert.match(pushStatus, /\$\{user\.grid\.nx\},\$\{user\.grid\.ny\}/);
    assert.doesNotMatch(pushStatus, /wasNotifiedRecently\(id,\s*["']current["']\)/);
  });

  test("worker/index.ts safely catches malformed JSON push payloads and supports distinct tags", () => {
    const workerContent = fs.readFileSync(path.resolve(import.meta.dirname, "../worker/index.ts"), "utf-8");
    assert.match(workerContent, /try\s*\{[\s\S]*?event\.data\?\.json\(\)[\s\S]*?\}\s*catch/);
    assert.match(workerContent, /data\.tag\s*\|\|\s*["']weather-alert["']/);
  });

  test("api/cron/weather tolerates scheduler delays (up to 3h) and midnight wrap for reminders", () => {
    const cronContent = fs.readFileSync(path.join(SRC_DIR, "cron/weather/route.ts"), "utf-8");
    assert.match(cronContent, /\(kstHour\s*-\s*targetBriefHour\s*\+\s*24\)\s*%\s*24/);
    assert.match(cronContent, /\(eStart\s*-\s*1\s*\+\s*24\)\s*%\s*24/);
    assert.match(cronContent, /weather-briefing/);
    assert.match(cronContent, /weather-evening/);
  });

  test("src/lib/kma.ts falls back from data.go.kr to apihub.kma.go.kr when gateway fails", async () => {
    const { getUltraSrtNcst } = await import("../src/lib/kma.ts");
    const origServiceKey = process.env.KMA_SERVICE_KEY;
    const origApihubKey = process.env.KMA_APIHUB_KEY;
    const origFetch = globalThis.fetch;

    process.env.KMA_SERVICE_KEY = "test-data-go-kr-key";
    process.env.KMA_APIHUB_KEY = "test-apihub-key";

    const calledUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.includes("apis.data.go.kr")) {
        // Simulate data.go.kr returning unexpected gateway JSON without response.header.resultCode
        return new Response(JSON.stringify({ cmmMsgHeader: { errMsg: "SERVICE ERROR", returnReasonCode: "04" } }), {
          status: 200,
        });
      }
      // Simulate apihub.kma.go.kr succeeding
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: {
              items: {
                item: [
                  { category: "T1H", obsrValue: "21.5" },
                  { category: "PTY", obsrValue: "0" },
                  { category: "REH", obsrValue: "55" },
                ],
              },
            },
          },
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      const res = await getUltraSrtNcst({ nx: 62, ny: 123 });
      assert.equal(res.temp, 21.5);
      assert.equal(res.humidity, 55);
      assert.ok(calledUrls.some((u) => u.includes("apis.data.go.kr")), "Tried data.go.kr first");
      assert.ok(calledUrls.some((u) => u.includes("apihub.kma.go.kr")), "Fell back to apihub.kma.go.kr");
    } finally {
      globalThis.fetch = origFetch;
      if (origServiceKey === undefined) delete process.env.KMA_SERVICE_KEY;
      else process.env.KMA_SERVICE_KEY = origServiceKey;
      if (origApihubKey === undefined) delete process.env.KMA_APIHUB_KEY;
      else process.env.KMA_APIHUB_KEY = origApihubKey;
    }
  });
});
