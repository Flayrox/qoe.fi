import { createClient } from "@qoe/supabase/server"
import type { ActionResult } from "@qoe/db/types"
import { actionOk, actionErr } from "@qoe/utils/action"

export function safeAction<TInput, TOutput>(
  action: (input: TInput, user: any) => Promise<TOutput>,
  requireAuth: boolean = true
): (input: TInput) => Promise<ActionResult<TOutput>> {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    try {
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (requireAuth && (authError || !user)) {
        return actionErr("Non autorisé. Veuillez vous connecter.", "UNAUTHORIZED")
      }

      const result = await action(input, user)
      return actionOk(result)
    } catch (e: any) {
      console.error("Safe action error:", e)
      return actionErr(e.message || "Une erreur interne est survenue.", "INTERNAL_ERROR")
    }
  }
}
