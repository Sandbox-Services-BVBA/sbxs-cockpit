# SBXS Cockpit Priority Model

## Product Goal

The cockpit is the trusted control surface for business operations, client
sites, infrastructure, active work, communications, home systems, and private
personal signals. "Everything at once" means one trustworthy rollup per domain
with exceptions promoted, not rendering every available chart at equal weight.

## How Priority Is Decided

Criticality and frequency are separate inputs. A rare outage outranks a chart
opened every day. The current hierarchy is based on operational impact because
the app does not yet measure feature usage. Navigation, drill-down, and control
events should be measured before frequency-based personalization is introduced.

## Hierarchy

1. **P0 Attention:** stale collectors, failed ingestion, active alerts, client
   outages, failed backups, service failures, and unsafe controls.
2. **P1 Daily work:** unbilled value, actionable mail, active agents/projects,
   bank position, office scenes, current ventilation, and current energy state.
3. **P2 Awareness:** healthy infrastructure, traffic analytics, recent time,
   climate, gas, water, and energy trends.
4. **P3 Detail/private:** raw metrics, full charts, files, sobriety, weight, and
   BTC. These stay out of the shared Wallboard.

## Domain Ownership

- **Overview:** posture, freshness, exceptions, and one compact signal per domain.
- **Attention:** the actionable incident queue only.
- **Client sites:** uptime, domains, screens, and traffic.
- **Infrastructure:** servers, services, backups, crons, and integrations.
- **Finance:** billing, cash position, and time entries.
- **Communications:** inbox and Mailroom workload.
- **Development:** agents, projects, file activity, and file access.
- **Home:** controls, energy, ventilation, climate, gas, and water.
- **Personal:** private health and asset data.
- **Wallboard:** non-sensitive, non-interactive operational signals.

## Remaining Release Gates

- Add global user/session authentication before exposing more controls.
  **Partially met (2026-09-04):** a password session (`COCKPIT_PASSWORD`,
  `/api/auth/*`) gates every dashboard write, which today means the layout
  profile. Reads are deliberately still open: the cockpit is Tailscale-fronted
  and the wallboard runs unattended. Any control that changes the house, a VM
  or a server still needs a read gate or a per-action confirmation before it
  ships; the GPU mode switch stays blocked on that.
- Rotate shared credentials and remove the CityScreens password from source.
- Add validation, timeouts, rate limits, and an audit log to write endpoints.
  **Met for the layout endpoints (2026-09-04):** catalog validation with a
  64 KB body cap, optimistic revision locking, login rate limiting, and
  `layout_audit_log` readable at `GET /api/layout/audit`. Not yet applied to
  the collector ingest (`/api/status`) or the home control proxies.
- Report unreachable servers explicitly instead of silently skipping them.
- Split heavy live home polling into shared snapshots or a push channel.
- Add event telemetry and use it to validate daily-work ordering.
