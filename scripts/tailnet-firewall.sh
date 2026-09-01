#!/bin/bash
# =====================================================================
# 🔥 tailnet-firewall.sh — Restreint les ports ADMIN au tailnet Tailscale
# =====================================================================
# 📖 Applique (idempotent) des règles iptables/ip6tables qui rendent les
#    interfaces d'administration joignables UNIQUEMENT depuis le tailnet :
#
#    INPUT (services host — Stalwart) :
#      - 28080  UI admin Stalwart (proxée par Caddy sur mail.admin.qoe.fi)
#      - 4190   ManageSieve (filtres mail, clients Thunderbird…)
#      Autorisé : tailnet (100.64/10 + fd7a::/48), docker (172.16/12, pour
#      que le conteneur Caddy atteigne le host), loopback. Le reste → DROP.
#
#    DOCKER-USER (ports publiés docker — stack Supabase) :
#      - 18000/18443  Kong (gateway Supabase)
#      - 15432/16543  Pooler (Postgres direct)
#      Seul le trafic arrivant par l'interface tailscale0 est autorisé ;
#      le reste (Internet) → DROP. Le trafic inter-conteneurs (docker
#      bridge) ne traverse PAS DOCKER-USER → API/worker/migrate continuent
#      de joindre kong/pooler normalement.
#
#    PREROUTING (DNAT tailnet → conteneur Caddy) :
#      docker-proxy (userland proxy) réécrit l'IP source en 172.x → le
#      matcher remote_ip de Caddy ne verrait jamais les 100.x du tailnet.
#      Un DNAT en PREROUTING (avant la décision de routage) court-circuite
#      docker-proxy : le paquet arrive directement au conteneur avec sa
#      VRAIE IP source. Sans cela, les dashboards *.admin.qoe.fi
#      répondraient 404 à tout le monde (tailnet compris).
#      ⚠️ À rejouer si qoefi-caddy est recréé (IP docker change) —
#      deploy-prod.sh le relance après chaque `up -d`.
#
# 🚀 Persistance : service systemd « qoe-tailnet-firewall » (oneshot,
#    After=tailscaled+docker) — voir docs/VPS_DEPLOYMENT_PREP.md.
# =====================================================================
set -euo pipefail

TS_V4="100.64.0.0/10"          # CGNAT Tailscale (IPv4)
TS_V6="fd7a:115c:a1e0::/48"    # ULA Tailscale (IPv6)
DOCKER_V4="172.16.0.0/12"      # bridges docker (caddy → host.docker.internal)
PORTS_HOST="28080 4190"        # Stalwart (UI admin + sieve)
PORTS_DOCKER="18000,18443,15432,16543"  # Kong + Pooler (publiés par docker)

# ─── INPUT : Stalwart (services host) ────────────────────────────────
for p in $PORTS_HOST; do
    iptables -C INPUT -p tcp --dport "$p" -j DROP 2>/dev/null \
        || iptables -I INPUT 1 -p tcp --dport "$p" -j DROP
    iptables -C INPUT -s "$TS_V4" -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
        || iptables -I INPUT 1 -s "$TS_V4" -p tcp --dport "$p" -j ACCEPT
    iptables -C INPUT -s "$DOCKER_V4" -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
        || iptables -I INPUT 1 -s "$DOCKER_V4" -p tcp --dport "$p" -j ACCEPT
    iptables -C INPUT -i lo -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
        || iptables -I INPUT 1 -i lo -p tcp --dport "$p" -j ACCEPT

    if ip6tables -L INPUT -n >/dev/null 2>&1; then
        ip6tables -C INPUT -p tcp --dport "$p" -j DROP 2>/dev/null \
            || ip6tables -I INPUT 1 -p tcp --dport "$p" -j DROP
        ip6tables -C INPUT -s "$TS_V6" -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
            || ip6tables -I INPUT 1 -s "$TS_V6" -p tcp --dport "$p" -j ACCEPT
        ip6tables -C INPUT -i lo -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
            || ip6tables -I INPUT 1 -i lo -p tcp --dport "$p" -j ACCEPT
    fi
done

# ─── DOCKER-USER : ports publiés docker (kong + pooler) ──────────────
iptables -C DOCKER-USER '!' -i tailscale0 -p tcp -m multiport --dports "$PORTS_DOCKER" -j DROP 2>/dev/null \
    || iptables -I DOCKER-USER 1 '!' -i tailscale0 -p tcp -m multiport --dports "$PORTS_DOCKER" -j DROP
if ip6tables -L DOCKER-USER -n >/dev/null 2>&1; then
    ip6tables -C DOCKER-USER '!' -i tailscale0 -p tcp -m multiport --dports "$PORTS_DOCKER" -j DROP 2>/dev/null \
        || ip6tables -I DOCKER-USER 1 '!' -i tailscale0 -p tcp -m multiport --dports "$PORTS_DOCKER" -j DROP
fi

# ─── PREROUTING : DNAT tailnet → conteneur Caddy (IP source préservée) ─
CADDY_IP=""
for _ in $(seq 1 20); do   # attend qoefi-caddy au boot (recreate = nouvelle IP)
    CADDY_IP=$(docker inspect qoefi-caddy --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | awk '{print $1}')
    [ -n "$CADDY_IP" ] && break
    sleep 2
done
if [ -n "$CADDY_IP" ]; then
    for p in 80 443; do
        iptables -t nat -C PREROUTING -d 100.117.195.127 -p tcp --dport "$p" -j DNAT --to-destination "$CADDY_IP:$p" 2>/dev/null \
            || iptables -t nat -I PREROUTING 1 -d 100.117.195.127 -p tcp --dport "$p" -j DNAT --to-destination "$CADDY_IP:$p"
    done
else
    echo "⚠️  qoefi-caddy introuvable — DNAT tailnet non posé (relancer après up -d caddy)"
fi

echo "✅ Firewall tailnet appliqué (stalwart $PORTS_HOST, docker $PORTS_DOCKER, DNAT tailnet→caddy)"
