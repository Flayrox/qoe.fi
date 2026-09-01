#!/bin/bash
# =====================================================================
# 🧭 install-tailnet-dns.sh — DNS privé du tailnet (dnsmasq)
# =====================================================================
# 📖 Installe/config active dnsmasq pour répondre UNIQUEMENT sur l'IP
#    tailnet du VPS :
#      *.admin.qoe.fi → <IP tailnet>   (dashboards admin, tailnet-only)
#      admin.qoe.fi   → <IP tailnet>   (l'admin plateforme, servi par
#                                       Caddy aussi sur le tailnet)
#    Couplé au split DNS Tailscale : Console Tailscale → DNS →
#    Nameservers → ajouter <IP tailnet>, restreint au domaine admin.qoe.fi.
#    Les appareils du tailnet résolvent alors studio/umami/mail.admin.qoe.fi
#    vers le tunnel ; le public ne peut pas router vers une IP 100.64/10.
#
# ⚠️ Pourquoi dnsmasq et pas coredns : coredns (1.11/1.12, port-map ou
#    host-net) renvoie des réponses avec ANCOUNT=0 sur ce host (records
#    présents mais compteur vide) → inutilisable. dnsmasq = éprouvé.
# =====================================================================
set -euo pipefail

TS_IP=$(tailscale ip -4 | awk '{print $1}')
[ -n "$TS_IP" ] || { echo "❌ IP tailnet introuvable (tailscale up ?)"; exit 1; }

if ! command -v dnsmasq >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y dnsmasq
fi

cat > /etc/dnsmasq.d/qoe-tailnet.conf <<EOF
# 🧭 QOE tailnet DNS — généré par scripts/install-tailnet-dns.sh
# Écoute UNIQUEMENT sur l'IP tailnet ($TS_IP) — jamais exposé au public.
bind-interfaces
listen-address=$TS_IP
no-resolv
no-hosts
address=/admin.qoe.fi/$TS_IP
EOF

systemctl enable dnsmasq >/dev/null 2>&1 || true
systemctl restart dnsmasq
echo "✅ dnsmasq actif sur $TS_IP:53 — *.admin.qoe.fi → $TS_IP"
