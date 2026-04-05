import { NextRequest } from "next/server";
import { exchangeCode, backfillWeight } from "@/lib/fitbit";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("Missing code parameter", { status: 400 });
  }

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("fitbit_verifier")?.value;
  if (!codeVerifier) {
    return new Response("Missing code verifier. Start the flow again at /api/fitbit/auth", { status: 400 });
  }

  try {
    await exchangeCode(code, codeVerifier);
    cookieStore.delete("fitbit_verifier");

    // Full historical backfill (5 years)
    const result = await backfillWeight(5);

    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#131820;color:#e8eaed">
        <h2 style="color:#fe644d">Fitbit connected!</h2>
        <p>Backfilled ${result.synced} weight entries (5 years).</p>
        <p>Daily sync will now keep it up to date.</p>
        <p><a href="/" style="color:#fe644d">Back to dashboard</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e) {
    return new Response(`Fitbit auth failed: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
}
