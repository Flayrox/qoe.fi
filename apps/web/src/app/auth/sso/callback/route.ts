import { createClient } from "@qoe/supabase/server";
import { verifyJWT, getCookieDomain } from "@qoe/supabase";
import { NextResponse } from "next/server";
import { getSafeRedirectUrl } from "@qoe/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("sso_token");
  const error = searchParams.get("error");
  const redirectTo = searchParams.get("redirect_to") || "/";

  const host = request.headers.get("host") || "lvh.me:3001";
  const hostname = host.split(":")[0];
  const protocol = request.headers.get("x-forwarded-proto") || "http";

  const safePath = getSafeRedirectUrl(redirectTo, "/");
  const redirectUrl = new URL(`${protocol}://${host}${safePath}`);

  const response = NextResponse.redirect(redirectUrl.toString());

  const cookieDomain = getCookieDomain(hostname);
  const isUnauthenticated = error === "unauthenticated";

  // If unauthenticated, keep sso_checked short (15s) so logging in adjacent tab is not blocked for 5 minutes
  response.cookies.set("sso_checked", "true", {
    path: "/",
    domain: cookieDomain,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: isUnauthenticated ? 15 : 300,
  });

  if (isUnauthenticated) {
    return response;
  }

  if (token) {
    const jwtSecret = process.env.SSO_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "dev-only-sso-secret-min-32-chars-qoe";
    if (process.env.NODE_ENV === "production" && !process.env.SSO_JWT_SECRET) {
      throw new Error("SSO_JWT_SECRET environment variable is strictly required in production");
    }

    const payload = await verifyJWT(token, jwtSecret);

    if (payload && payload.access_token && payload.refresh_token) {
      const supabase = await createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: payload.access_token as string,
        refresh_token: payload.refresh_token as string,
      });

      if (sessionError) {
        console.error("SSO Callback: Failed to set Supabase session:", sessionError);
      }
    } else {
      console.warn("SSO Callback: JWT token validation failed or expired");
    }
  }

  return response;
}
