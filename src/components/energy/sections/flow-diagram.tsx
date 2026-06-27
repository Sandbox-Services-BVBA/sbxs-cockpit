"use client";

import { EC, fmtW, gd, gridColor, type Live } from "@/lib/energy-format";

// Live energy flow: Zon / Net / Batterij feeding the Huis node. Arrow thickness
// scales with watts; dashes animate in the direction energy actually flows.
export function FlowDiagram({ live }: { live: Live }) {
  const W = 360,
    H = 300;
  const huis = { x: 180, y: 150 };
  const zon = { x: 180, y: 44 };
  const net = { x: 64, y: 252 };
  const bat = { x: 296, y: 252 };
  const sw = (w: number) => (w < 30 ? 1.2 : Math.max(2, Math.min(11, w / 200)));
  const gridShown = gd(live.grid_w); // deadbanded so the balancing hunt reads as 0
  const flows = [
    { from: zon, w: live.solar_w, color: EC.solar, dir: "in" as const },
    {
      from: net,
      w: Math.abs(gridShown),
      color: gridColor(gridShown),
      dir: gridShown >= 0 ? ("in" as const) : ("out" as const),
    },
    { from: bat, w: Math.abs(live.bat_w), color: EC.battery, dir: live.bat_w > 0 ? ("in" as const) : ("out" as const) },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full" style={{ maxHeight: 340 }}>
      {flows.map((f, i) => {
        const active = f.w >= 30;
        return (
          <g key={i}>
            <line x1={f.from.x} y1={f.from.y} x2={huis.x} y2={huis.y} stroke="var(--border)" strokeWidth={sw(f.w) + 3} opacity={0.25} />
            <line
              x1={f.from.x}
              y1={f.from.y}
              x2={huis.x}
              y2={huis.y}
              stroke={f.color}
              strokeWidth={sw(f.w)}
              strokeDasharray="3 7"
              opacity={active ? 0.95 : 0.3}
              style={active ? { animation: `${f.dir === "in" ? "flow-fwd" : "flow-rev"} 0.9s linear infinite` } : undefined}
            />
          </g>
        );
      })}
      <FlowNode x={zon.x} y={zon.y} label="Zon" value={fmtW(live.solar_w)} color={EC.solar} />
      <FlowNode x={huis.x} y={huis.y} label="Huis" value={fmtW(live.house_w)} color={EC.house} />
      <FlowNode
        x={net.x}
        y={net.y}
        label={gridShown === 0 ? "Net balans" : gridShown > 0 ? "Net afname" : "Net injectie"}
        value={fmtW(Math.abs(gridShown))}
        color={gridShown === 0 ? EC.house : gridColor(gridShown)}
      />
      <FlowNode
        x={bat.x}
        y={bat.y}
        label={live.bat_w < 0 ? "Batterij laadt" : live.bat_w > 0 ? "Batterij ontlaadt" : "Batterij"}
        value={fmtW(Math.abs(live.bat_w))}
        color={EC.battery}
      />
    </svg>
  );
}

function FlowNode({ x, y, label, value, color }: { x: number; y: number; label: string; value: string; color: string }) {
  const w = 110,
    h = 48;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="var(--card)" stroke={color} strokeWidth={2} />
      <text x={x} y={y - 7} textAnchor="middle" fontSize="9" fontWeight={700} fill="var(--muted-foreground)">
        {label.toUpperCase()}
      </text>
      <text x={x} y={y + 14} textAnchor="middle" fontSize="16" fontWeight={700} fill={color}>
        {value}
      </text>
    </g>
  );
}
