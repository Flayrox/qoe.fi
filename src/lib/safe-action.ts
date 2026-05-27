import { createClient } from "@/lib/supabase/server"

export type ActionResponse<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export function safeAction<TInput, TOutput>(
  action: (input: TInput, user: any) => Promise<TOutput>,
  requireAuth: boolean = true
) {
  return async (input: TInput): Promise<ActionResponse<TOutput>> => {
    try {
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (requireAuth && (authError || !user)) {
        return { success: false, error: "Unauthorized" }
      }

      const result = await action(input, user)
      return { success: true, data: result }
    } catch (e: any) {
      console.error("Safe action error:", e)
      return { success: false, error: e.message || "An internal error occurred" }
    }
  }
}
