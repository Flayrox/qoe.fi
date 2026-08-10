import { createClient } from "@qoe/supabase/server";
import { signJWT } from "@qoe/supabase";
import { NextResponse } from "next/server";
import { getSafeRedirectUrl } from "@qoe/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("return_to");
  const state = searchParams.get("state");

  if (!returnTo) {
    return new Response("Missing return_to parameter", { status: 400 });
  }

  const safeReturnUrl = getSafeRedirectUrl(returnTo, "");
  if (!safeReturnUrl) {
    return new Response("Unauthorized return_to domain", { status: 403 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const redirectUrl = new URL(safeReturnUrl);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  if (session && session.access_token && session.refresh_token) {
    const jwtSecret = process.env.SSO_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "dev-only-sso-secret-min-32-chars-qoe";
    if (process.env.NODE_ENV === "production" && !process.env.SSO_JWT_SECRET) {
      throw new Error("SSO_JWT_SECRET environment variable is strictly required in production");
    }

    const token = await signJWT(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        userId: session.user.id,
        nonce: state || undefined,
      },
      jwtSecret,
      60
    );

    redirectUrl.searchParams.set("sso_token", token);
    return NextResponse.redirect(redirectUrl.toString());
  } else {
    redirectUrl.searchParams.set("error", "unauthenticated");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
