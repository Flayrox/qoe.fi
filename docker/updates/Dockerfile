# =====================================================================
# 📦 qoe-updates — serveur d'updates OTA expo-updates
# =====================================================================
# Node pur, zéro dépendance npm : l'image est minuscule et ne télécharge
# rien au build (réseau privé friendly).
# Le volume /app/updates contient les bundles exportés :
#   updates/<runtimeVersion>/<horodatage>/{metadata.json, _expo/…, assets/…}
# Publiez avec : scripts/publish-update.sh
# =====================================================================
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    UPDATES_ROOT=/app/updates

WORKDIR /app

# Pas de node_modules : server.js est sans dépendance.
COPY server.js package.json ./

RUN mkdir -p /app/updates

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1 || exit 1

USER node

CMD ["node", "server.js"]
