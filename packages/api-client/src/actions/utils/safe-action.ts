import { createClient } from "@qoe/supabase/server";
import { type ActionResult, actionOk, actionErr } from "@qoe/utils";

export interface SafeActionOptions {
  requireAuth?: boolean;
}

export function safeAction<TInput, TOutput>(
  actionFn: (input: TInput, user: any) => Promise<TOutput>,
  options: SafeActionOptions = { requireAuth: true }
): (input: TInput) => Promise<ActionResult<TOutput>> {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (options.requireAuth !== false && (authError || !user)) {
        return actionErr("Non autorisé. Veuillez vous connecter.", "UNAUTHORIZED");
      }

      const result = await actionFn(input, user);
      return actionOk(result);
    } catch (e: any) {
      console.error("[SafeAction Error]:", e);
      return actionErr(
        e?.message || "Une erreur interne est survenue.",
        e?.code || "INTERNAL_ERROR"
      );
    }
  };
}
