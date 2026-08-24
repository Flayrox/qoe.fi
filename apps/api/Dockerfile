# =====================================================================
# 🐳 api — Dockerfile multi-stage (binaire final < 25 Mo)
# =====================================================================
# Stage 1 : builder (compilation statique)
FROM golang:1.26-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/qoe-server ./cmd/server \
    && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/qoe-worker ./cmd/worker \
    && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/qoe-migrate ./cmd/migrate

# Stage 2 : image runtime finale (alpine, ca-certificates pour HTTPS webhooks)
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S qoe && adduser -S qoe -G qoe

COPY --from=builder /out/qoe-server /usr/local/bin/qoe-server
COPY --from=builder /out/qoe-worker /usr/local/bin/qoe-worker
COPY --from=builder /out/qoe-migrate /usr/local/bin/qoe-migrate
# Migrations goose embarquées (qoe-migrate -dir /migrations up).
COPY --from=builder /src/sql/migrations /migrations

USER qoe
EXPOSE 8080

# Par défaut : serveur API. (worker → `qoe-worker`)
ENTRYPOINT ["/usr/local/bin/qoe-server"]
