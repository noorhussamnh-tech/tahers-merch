import { afterEach, describe, expect, it, vi } from "vitest";

import { versionInfo, versionResponse } from "./version.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("versionInfo", () => {
  it("reports the deployed commit, shortened", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "57ea68cabcdef1234567890");
    expect(versionInfo().commit).toBe("57ea68ca");
  });

  it("says unknown rather than crashing when nothing is set", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("VERCEL_ENV", "");
    const info = versionInfo();
    expect(info.commit).toBe("unknown");
    expect(info.environment).toBe("local");
  });

  it("stamps the moment it answered, so a stale reply is visible", () => {
    expect(Date.parse(versionInfo().now)).not.toBeNaN();
  });
});

describe("versionResponse", () => {
  it("is json", async () => {
    const response = versionResponse();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(await response.text())).toHaveProperty("commit");
  });

  it("is never cached -- a cached answer here is confidently wrong", () => {
    expect(versionResponse().headers.get("cache-control")).toContain("no-store");
  });

  it("leaks no secret from the environment", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-must-not-appear");
    vi.stubEnv("PAYMOB_HMAC_SECRET", "hmac-must-not-appear");
    vi.stubEnv("RESEND_API_KEY", "resend-must-not-appear");
    const body = await versionResponse().text();
    expect(body).not.toContain("must-not-appear");
  });
});
