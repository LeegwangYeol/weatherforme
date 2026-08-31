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
});
