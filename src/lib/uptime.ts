import { getDb } from "./db";
import { createAlert, resolveAlerts } from "./alerts";
import { config } from "./config";
import tls from "tls";

const DEFAULT_SECONDARY_PATHS = ["/contact/"];

// Patterns that indicate a soft-500 (server returns 200 but body contains error page)
const ERROR_BODY_PATTERNS = [
  "500 Internal Server Error",
  "Fatal error",
  "Parse error",
  "There has been a critical error on this website",
];

interface PathCheckResult {
  path: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  isUp: boolean;
}

async function checkUrl(fullUrl: string): Promise<PathCheckResult & { path: string }> {
  const start = Date.now();
  let statusCode: number | null = null;
  let isUp = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Use GET instead of HEAD so we can inspect the body for soft-500s
    const res = await fetch(fullUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    statusCode = res.status;
    isUp = statusCode >= 200 && statusCode < 400;

    // Content sniff: check for error pages served as 200
    if (isUp) {
      const body = await res.text();
      const hasErrorContent = ERROR_BODY_PATTERNS.some((pattern) =>
        body.includes(pattern)
      );
      if (hasErrorContent) {
        isUp = false;
        // Mark as soft-500 so the alert includes this detail
        statusCode = statusCode; // keep the real status code for logging
      }
    }
  } catch {
    isUp = false;
  }

  const responseTimeMs = Date.now() - start;
  const urlPath = new URL(fullUrl).pathname;

  return { path: urlPath, statusCode, responseTimeMs, isUp };
}

export async function checkSite(
  baseUrl: string,
  name: string,
  paths?: string[]
) {
  const db = getDb();

  // Determine which paths to check
  const secondaryPaths = paths ?? DEFAULT_SECONDARY_PATHS;
  const allPaths = ["/", ...secondaryPaths.filter((p) => p !== "/")];

  // Check all paths
  const results: PathCheckResult[] = [];
  for (const pathStr of allPaths) {
    const fullUrl = new URL(pathStr, baseUrl).href;
    const result = await checkUrl(fullUrl);
    results.push(result);
  }

  // SSL check (once per site, on the root)
  let sslExpiryDate: string | null = null;
  let sslDaysRemaining: number | null = null;

  if (baseUrl.startsWith("https://")) {
    try {
      const hostname = new URL(baseUrl).hostname;
      const sslInfo = await getSSLExpiry(hostname);
      if (sslInfo) {
        sslExpiryDate = sslInfo.toISOString();
        sslDaysRemaining = Math.floor(
          (sslInfo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
      }
    } catch {
      // SSL check failed, not critical
    }
  }

  // Store each path result as a separate row
  for (const r of results) {
    db.prepare(`
      INSERT INTO uptime_checks (site_url, site_name, checked_path, status_code,
        response_time_ms, is_up, ssl_expiry_date, ssl_days_remaining)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      baseUrl,
      name,
      r.path,
      r.statusCode,
      r.responseTimeMs,
      r.isUp ? 1 : 0,
      r.path === "/" ? sslExpiryDate : null,
      r.path === "/" ? sslDaysRemaining : null
    );
  }

  // Alert logic: site is down if ANY path fails
  const failingPaths = results.filter((r) => !r.isUp);
  const allUp = failingPaths.length === 0;

  if (!allUp) {
    // Check consecutive failures per failing path
    for (const failing of failingPaths) {
      const recentChecks = db
        .prepare(
          `SELECT is_up FROM uptime_checks
           WHERE site_url = ? AND checked_path = ?
           ORDER BY id DESC LIMIT ?`
        )
        .all(
          baseUrl,
          failing.path,
          config.alerts.uptimeFailuresBeforeAlert
        ) as { is_up: number }[];

      const allDown =
        recentChecks.length >= config.alerts.uptimeFailuresBeforeAlert &&
        recentChecks.every((c) => !c.is_up);

      if (allDown) {
        const fullUrl = new URL(failing.path, baseUrl).href;
        const detail =
          failing.path === "/"
            ? `Site is down (${failing.statusCode || "unreachable"})`
            : `${fullUrl} is down (${failing.statusCode || "unreachable"})`;
        createAlert("critical", "uptime", name, detail);
      }
    }
  } else {
    resolveAlerts("uptime", name);
  }

  // SSL expiry warning
  if (
    sslDaysRemaining !== null &&
    sslDaysRemaining <= config.alerts.sslWarningDays
  ) {
    createAlert(
      "warning",
      "ssl",
      name,
      `SSL expires in ${sslDaysRemaining} days`
    );
  } else if (
    sslDaysRemaining !== null &&
    sslDaysRemaining > config.alerts.sslWarningDays
  ) {
    resolveAlerts("ssl", name);
  }

  return {
    url: baseUrl,
    name,
    paths: results,
    sslExpiryDate,
    sslDaysRemaining,
    isUp: allUp,
  };
}

function getSSLExpiry(hostname: string): Promise<Date | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      443,
      hostname,
      { servername: hostname },
      () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (cert && cert.valid_to) {
          resolve(new Date(cert.valid_to));
        } else {
          resolve(null);
        }
      }
    );
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => {
      resolve(null);
    });
  });
}

export async function runUptimeChecks() {
  const results = [];
  for (const site of config.uptimeSites) {
    const result = await checkSite(site.url, site.name, site.paths);
    results.push(result);
  }
  return results;
}
