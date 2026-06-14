// =====================================================================
// 📊 Server Analytics — Pour Server Actions
// =====================================================================

/**
 * 📊 Track un event depuis le serveur (s'écrit dans les logs).
 * Utile pour les events business (paiement, inscription, etc.)
 * que tu veux tracer même si l'utilisateur bloque le JS client.
 */
export async function trackServerEvent(
  event: string,
  data?: Record<string, unknown>
) {
  // Log structuré (à connecter à un service type Axiom/Logtail/Datadog)
  console.log(
    JSON.stringify({
      type: "analytics:event",
      event,
      data,
      timestamp: new Date().toISOString(),
    })
  );
}
