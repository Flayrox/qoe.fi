import { createClient } from "@qoe/supabase/server";
import { signJWT } from "@qoe/supabase";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("return_to");

  if (!returnTo) {
    return new Response("Missing return_to parameter", { status: 400 });
  }

  let allowed = false;
  try {
    const returnUrl = new URL(returnTo);
    const hostname = returnUrl.hostname;
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".qoe.test") ||
      hostname.endsWith(".qoe.fi") ||
      hostname.endsWith(".lvh.me")
    ) {
      allowed = true;
    }
  } catch {
    return new Response("Invalid return_to URL", { status: 400 });
  }

  if (!allowed) {
    return new Response("Unauthorized return_to domain", { status: 403 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (session && session.access_token && session.refresh_token) {
    const secret = process.env.SSO_JWT_SECRET || "sso-jwt-secret-key-32-chars-at-least-super-safe";
    const token = await signJWT(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        userId: session.user.id,
      },
      secret,
      30
    );

    const redirectUrl = new URL(returnTo);
    redirectUrl.searchParams.set("sso_token", token);
    return NextResponse.redirect(redirectUrl.toString());
  } else {
    const redirectUrl = new URL(returnTo);
    redirectUrl.searchParams.set("error", "unauthenticated");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
