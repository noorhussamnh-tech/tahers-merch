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

describe("orderNotifications", () => {
  it("is off when nothing is configured", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    expect(versionInfo().orderNotifications).toBe("off");
  });

  it("needs BOTH the key and a recipient before it claims email works", () => {
    // A key with nowhere to send is the exact trap this is meant to catch.
    vi.stubEnv("RESEND_API_KEY", "re_xxx");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    expect(versionInfo().orderNotifications).toBe("off");
  });

  it("reports email once both are set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_xxx");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "orders@example.com");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    expect(versionInfo().orderNotifications).toBe("email");
  });

  it("never puts any part of a key in the response", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_secret_must_not_appear");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "orders@example.com");
    const body = await versionResponse().text();
    expect(body).not.toContain("must_not_appear");
    expect(body).not.toContain("orders@example.com");
  });
});
