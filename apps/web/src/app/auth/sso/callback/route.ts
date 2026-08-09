import { createClient } from "@qoe/supabase/server";
import { verifyJWT } from "@qoe/supabase";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("sso_token");
  const error = searchParams.get("error");
  const redirectTo = searchParams.get("redirect_to") || "/";
  
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  
  const redirectUrl = new URL(`${protocol}://${host}${redirectTo}`);

  const response = NextResponse.redirect(redirectUrl.toString());

  response.cookies.set("sso_checked", "true", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300, // 5 minutes
  });

  if (error === "unauthenticated") {
    return response;
  }

  if (token) {
    const secret = process.env.SSO_JWT_SECRET;
    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error("SSO_JWT_SECRET variable is required in production");
    }
    const jwtSecret = secret || "sso-jwt-secret-key-32-chars-at-least-super-safe";
    const payload = await verifyJWT(token, jwtSecret);

    if (payload && payload.access_token && payload.refresh_token) {
      const supabase = await createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
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
