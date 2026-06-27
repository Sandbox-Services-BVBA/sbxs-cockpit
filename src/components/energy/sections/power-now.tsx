"use client";

import { Sun, Zap, Home, BatteryCharging } from "lucide-react";
import { Section, Metric, Verdict, LivePulse } from "../ui";
import { FlowDiagram } from "./flow-diagram";
import { EC, fmtW, gd, gridColor, statusLine, type Live } from "@/lib/energy-format";

// "Power now" — the live landing section. Hero = net import/export (the number
// that decides whether you're buying or selling). Flow diagram on the right on
// wide screens, stacked under the tiles on phones.
export function PowerNow({ live, tick, intervalMs }: { live: Live; tick: number; intervalMs: number }) {
  const status = statusLine(live);
  const gridShown = gd(live.grid_w);
  const batLabel = live.bat_w < -60 ? "laadt" : live.bat_w > 60 ? "ontlaadt" : "idle";

  return (
    <Section
      title="Vermogen nu"
      icon={Zap}
      right={
        <LivePulse
          intervalMs={intervalMs}
          tick={tick}
          label={`live · piek ${fmtW(live.grid?.monthly_peak_w)} · T${live.grid?.tariff ?? "?"}`}
        />
      }
    >
      <div className="space-y-3">
        <Verdict text={status.text} good={status.good} />

        <div className="grid gap-3 lg:grid-cols-[1fr_minmax(280px,360px)]">
          {/* Hero tile + supporting tiles */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 content-start">
            <Metric
              icon={Zap}
              label={gridShown === 0 ? "Net balans" : gridShown > 0 ? "Net afname" : "Net injectie"}
              value={fmtW(Math.abs(gridShown))}
              color={gridShown === 0 ? EC.house : gridColor(gridShown)}
              hero
              sub={gridShown === 0 ? "batterij in balans" : gridShown > 0 ? "je koopt van het net" : "je verkoopt aan het net"}
              className="col-span-2"
            />
            <Metric
              icon={Sun}
              label="Zon"
              value={fmtW(live.solar_w)}
              color={EC.solar}
              sub={live.solar?.total_yield_kwh != null ? `${live.solar.total_yield_kwh.toLocaleString("nl-BE")} kWh totaal` : undefined}
            />
            <Metric icon={Home} label="Verbruik" value={fmtW(live.house_w)} color={EC.house} />
            <Metric
              icon={BatteryCharging}
              label="Batterij"
              value={fmtW(Math.abs(live.bat_w))}
              color={EC.battery}
              sub={`${batLabel}${live.soc_avg != null ? ` · ${live.soc_avg}%` : ""}`}
              className="col-span-2"
            />
          </div>

          {/* Flow diagram */}
          <div className="border-2 border-border p-2">
            <FlowDiagram live={live} />
          </div>
        </div>
      </div>
    </Section>
  );
}
