import { getDb } from "@/lib/db";

// Every accepted layout save or reset leaves a row, so a surprising dashboard
// can be traced to a moment and an actor instead of guessed at.

export type LayoutAuditAction = "save" | "reset";

export interface LayoutAuditRow {
  id: number;
  at: string;
  action: string;
  actor: string;
  revision: number | null;
  summary: string | null;
}

export function recordLayoutAudit(
  action: LayoutAuditAction,
  actor: string,
  revision: number | null,
  summary: string | null
): void {
  getDb()
    .prepare("INSERT INTO layout_audit_log (action, actor, revision, summary) VALUES (?, ?, ?, ?)")
    .run(action, actor, revision, summary);
}

export function readLayoutAudit(limit = 50): LayoutAuditRow[] {
  const capped = Math.max(1, Math.min(500, Math.floor(limit)));
  return getDb()
    .prepare("SELECT id, at, action, actor, revision, summary FROM layout_audit_log ORDER BY id DESC LIMIT ?")
    .all(capped) as LayoutAuditRow[];
}
