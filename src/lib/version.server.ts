/**
 * What is actually deployed right now. SERVER ONLY.
 *
 * This exists because of a real half hour lost to it: nine commits were on
 * GitHub, the site was serving the first of them, and there was no way to tell
 * from the outside whether Vercel was building slowly, had failed, or had
 * stopped listening. The site looked stale and nothing said why.
 *
 * `curl https://<site>/api/version` now answers that in one line. Vercel sets
 * these variables itself on every deployment -- nothing has to be configured
 * for it to work, and it reads them at request time, so no build step is
 * involved and it cannot break a build.
 *
 * Only the commit and the region go out. No environment variable is echoed
 * beyond these, because /api/version is public and always will be.
 */
export interface VersionInfo {
  /** The commit this deployment was built from. "unknown" outside Vercel. */
  readonly commit: string;
  readonly branch: string;
  /** "production" for the live site, "preview" for a branch deployment. */
  readonly environment: string;
  readonly region: string;
  /**
   * Whether new-order notifications are switched on in THIS deployment.
   *
   * Answers a question that otherwise has no answer short of placing a real
   * order: the keys are set in Vercel, they are baked in at deploy time, and
   * adding them without redeploying changes nothing. This says what the
   * running code can actually see.
   *
   * It reports only whether the values are present -- never any part of them.
   */
  readonly orderNotifications: "email" | "email+telegram" | "telegram" | "off";

  /** When this request was served -- proof the answer is not itself cached. */
  readonly now: string;
}

function notificationChannels(): VersionInfo["orderNotifications"] {
  const email = Boolean(envOr("RESEND_API_KEY", "") && envOr("ORDER_NOTIFICATION_EMAIL", ""));
  const telegram = Boolean(envOr("TELEGRAM_BOT_TOKEN", "") && envOr("TELEGRAM_CHAT_ID", ""));
  if (email && telegram) return "email+telegram";
  if (email) return "email";
  if (telegram) return "telegram";
  return "off";
}

/**
 * An environment variable, or the fallback.
 *
 * `??` alone is not enough here: Vercel sets these to the EMPTY STRING rather
 * than leaving them out on a deployment with no Git behind it -- a CLI deploy,
 * for instance -- and an empty commit reads as "the endpoint is broken" when
 * the truth is "there is no commit". Blank counts as absent.
 */
function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

export function versionInfo(): VersionInfo {
  return {
    commit: envOr("VERCEL_GIT_COMMIT_SHA", "unknown").slice(0, 8),
    branch: envOr("VERCEL_GIT_COMMIT_REF", "unknown"),
    environment: envOr("VERCEL_ENV", "local"),
    region: envOr("VERCEL_REGION", "local"),
    orderNotifications: notificationChannels(),
    now: new Date().toISOString(),
  };
}

export function versionResponse(): Response {
  return new Response(JSON.stringify(versionInfo(), null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Never cached, anywhere. A cached answer to "what is deployed?" is
      // worse than no answer, because it is confidently wrong.
      "cache-control": "no-store, max-age=0",
    },
  });
}
