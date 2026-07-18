// Physical layout of the house, used to place sensor readings in the right
// place on the diagram. Sensor names come from energy-monitor as free text, so
// matching is case-insensitive on a substring rather than an exact key.
//
// Floors, top to bottom: attic (office), middle (3 rooms), ground (living).
// There is currently no sensor in the attic office — the slot renders as a
// placeholder rather than borrowing another room's reading.

export type FloorId = "attic" | "middle" | "ground";

export interface RoomSlot {
  id: string;
  label: string;
  floor: FloorId;
  match: string | null; // substring matched against the sensor's room name
}

export const ROOM_SLOTS: RoomSlot[] = [
  { id: "kantoor", label: "Kantoor", floor: "attic", match: null },
  { id: "babykamer", label: "Babykamer", floor: "middle", match: "baby" },
  { id: "badkamer", label: "Badkamer", floor: "middle", match: "bad" },
  { id: "slaapkamer", label: "Slaapkamer", floor: "middle", match: "slaap" },
  { id: "woonkamer", label: "Woonkamer", floor: "ground", match: "woon" },
];

export interface ClimatePoint {
  t: number;
  temp: number | null;
  rh: number | null;
}
export interface ClimateSeries {
  room: string;
  outdoor: boolean;
  points: ClimatePoint[];
}

export interface Reading {
  temp: number | null;
  rh: number | null;
}

function latest(series: ClimateSeries | undefined): Reading | null {
  if (!series) return null;
  for (let i = series.points.length - 1; i >= 0; i--) {
    const p = series.points[i];
    if (p.temp != null) return { temp: p.temp, rh: p.rh };
  }
  return null;
}

export interface HouseClimate {
  rooms: Record<string, Reading | null>;
  outside: Reading | null;
  outsideLabel: string | null;
}

export function readHouseClimate(series: ClimateSeries[] | undefined): HouseClimate {
  const all = series ?? [];
  const outdoor = all.find((s) => s.outdoor);
  const rooms: Record<string, Reading | null> = {};

  for (const slot of ROOM_SLOTS) {
    if (!slot.match) {
      rooms[slot.id] = null;
      continue;
    }
    const hit = all.find((s) => !s.outdoor && s.room.toLowerCase().includes(slot.match!));
    rooms[slot.id] = latest(hit);
  }

  return {
    rooms,
    outside: latest(outdoor),
    outsideLabel: outdoor?.room ?? null,
  };
}

export function fmtTemp(r: Reading | null | undefined): string {
  if (!r || r.temp == null) return "—";
  return `${r.temp.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
}

// Warm rooms read amber, cold rooms blue, comfortable rooms stay neutral.
export function tempColor(r: Reading | null | undefined): string {
  if (!r || r.temp == null) return "#94a3b8";
  if (r.temp >= 25) return "#f97316";
  if (r.temp >= 23.5) return "#f59e0b";
  if (r.temp >= 19) return "#22c55e";
  if (r.temp >= 16) return "#06b6d4";
  return "#3b82f6";
}
