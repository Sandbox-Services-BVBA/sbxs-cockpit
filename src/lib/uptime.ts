import { getDb } from "./db";
import { createAlert, resolveAlerts } from "./alerts";
import { config } from "./config";
import tls from "tls";

export async function checkSite(url: string, name: string) {
  const start = Date.now();
  let statusCode: number | null = null;
  let isUp = false;
  let responseTimeMs: number | null = null;
  let sslExpiryDate: string | null = null;
  let sslDaysRemaining: number | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    statusCode = res.status;
    responseTimeMs = Date.now() - start;
    isUp = statusCode >= 200 && statusCode < 400;
  } catch {
    responseTimeMs = Date.now() - start;
    isUp = false;
  }

  // Check SSL certificate expiry
  if (url.startsWith("https://")) {
    try {
      const hostname = new URL(url).hostname;
      const sslInfo = await getSSLExpiry(hostname);
      if (sslInfo) {
        sslExpiryDate = sslInfo.toISOString();
        sslDaysRemaining = Math.floor((sslInfo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }
    } catch {
      // SSL check failed, not critical
    }
  }

  // Store result
  const db = getDb();
  db.prepare(`
    INSERT INTO uptime_checks (site_url, site_name, status_code, response_time_ms,
      is_up, ssl_expiry_date, ssl_days_remaining)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(url, name, statusCode, responseTimeMs, isUp ? 1 : 0, sslExpiryDate, sslDaysRemaining);

  // Check for consecutive failures
  if (!isUp) {
    const recentChecks = db.prepare(`
      SELECT is_up FROM uptime_checks
      WHERE site_url = ?
      ORDER BY id DESC LIMIT ?
    `).all(url, config.alerts.uptimeFailuresBeforeAlert) as { is_up: number }[];

    const allDown = recentChecks.length >= config.alerts.uptimeFailuresBeforeAlert &&
      recentChecks.every((c) => !c.is_up);

    if (allDown) {
      createAlert("critical", "uptime", name, `Site is down (${statusCode || "unreachable"})`);
    }
  } else {
    resolveAlerts("uptime", name);
  }

  // SSL expiry warning
  if (sslDaysRemaining !== null && sslDaysRemaining <= config.alerts.sslWarningDays) {
    createAlert("warning", "ssl", name, `SSL expires in ${sslDaysRemaining} days`);
  } else if (sslDaysRemaining !== null && sslDaysRemaining > config.alerts.sslWarningDays) {
    resolveAlerts("ssl", name);
  }

  return { url, name, statusCode, responseTimeMs, isUp, sslExpiryDate, sslDaysRemaining };
}

function getSSLExpiry(hostname: string): Promise<Date | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, { servername: hostname }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (cert && cert.valid_to) {
        resolve(new Date(cert.valid_to));
      } else {
        resolve(null);
      }
    });
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
    const result = await checkSite(site.url, site.name);
    results.push(result);
  }
  return results;
}
