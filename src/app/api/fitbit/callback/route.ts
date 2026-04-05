import { NextRequest } from "next/server";
import { exchangeCode, syncWeightData } from "@/lib/fitbit";
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

    // Delete the verifier cookie
    cookieStore.delete("fitbit_verifier");

    // Do initial weight sync
    const result = await syncWeightData();

    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#131820;color:#e8eaed">
        <h2>Fitbit connected!</h2>
        <p>Synced ${result.synced} new weight entries.</p>
        <p><a href="/" style="color:#fe644d">Back to dashboard</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e) {
    return new Response(`Fitbit auth failed: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
}
