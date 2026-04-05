import { generateAuthUrl } from "@/lib/fitbit";
import { cookies } from "next/headers";

export async function GET() {
  const { url, codeVerifier } = generateAuthUrl();

  // Store code verifier in a cookie for the callback
  const cookieStore = await cookies();
  cookieStore.set("fitbit_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return Response.redirect(url);
}
