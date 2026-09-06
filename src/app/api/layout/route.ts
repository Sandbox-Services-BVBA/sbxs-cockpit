import { recordLayoutAudit } from "@/lib/audit";
import { readProfile, resetProfile, writeProfile } from "@/lib/layout/store";
import { MAX_PROFILE_BYTES, validateProfile } from "@/lib/layout/validate";
import type { LayoutProfile } from "@/lib/layout/types";
import { canWrite, hasValidSession } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The saved layout profile.
//   GET    /api/layout  -> { profile, revision }   public read
//   PUT    /api/layout  <- { profile, expectedRevision }   session or bearer key
//   DELETE /api/layout  -> back to code defaults   session or bearer key
// Reads are open because the dashboard itself is; only writes are gated.

const NO_STORE = { "Cache-Control": "no-store" };

function profileResponse(profile: LayoutProfile, status = 200) {
  return Response.json({ profile, revision: profile.revision }, { status, headers: NO_STORE });
}

function actorFor(request: Request): string {
  return hasValidSession(request) ? "session" : "api-key";
}

function summarize(profile: LayoutProfile): string {
  const views = Object.values(profile.views ?? {});
  const modules = views.reduce((n, view) => n + Object.keys(view?.modules ?? {}).length, 0);
  const ordered = views.filter((view) => view?.order?.length).length;
  return `views=${views.length} ordered=${ordered} modules=${modules}`;
}

export async function GET() {
  return profileResponse(readProfile());
}

export async function PUT(request: Request) {
  if (!canWrite(request)) return unauthorizedResponse();

  // Cheap check on the declared length first, then on what actually arrived,
  // because content-length is advisory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PROFILE_BYTES) {
    return Response.json({ error: "body too large" }, { status: 413 });
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_PROFILE_BYTES) {
    return Response.json({ error: "body too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "body must be an object" }, { status: 400 });
  }
  const { profile, expectedRevision } = body as { profile?: unknown; expectedRevision?: unknown };
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return Response.json({ error: "expectedRevision must be a non-negative integer" }, { status: 400 });
  }

  const validated = validateProfile(profile);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const result = writeProfile(validated.profile, expectedRevision);
  if (!result.ok) {
    // Hand back the current profile so the client reloads instead of retrying blind.
    return Response.json(
      { error: "revision conflict", profile: result.profile, revision: result.profile.revision },
      { status: 409, headers: NO_STORE }
    );
  }

  recordLayoutAudit("save", actorFor(request), result.profile.revision, summarize(result.profile));
  return profileResponse(result.profile);
}

export async function DELETE(request: Request) {
  if (!canWrite(request)) return unauthorizedResponse();
  const profile = resetProfile();
  recordLayoutAudit("reset", actorFor(request), profile.revision, "all views reset to defaults");
  return profileResponse(profile);
}
