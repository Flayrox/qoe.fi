-- =====================================================================
-- 📬 Newsletters créateurs : issues + livraisons
-- =====================================================================
-- Un créateur rédige une NewsletterIssue (brouillon → envoi) qui est
-- distribuée par le worker aux abonnés actifs ayant receiveArticles=true.
-- Les livraisons sont tracées par NewsletterDelivery (dédup issue+email).

-- +goose Up

CREATE TABLE IF NOT EXISTS "NewsletterIssue" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "html" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NewsletterIssue_publicationId_idx"
    ON "NewsletterIssue"("publicationId");

CREATE TABLE IF NOT EXISTS "NewsletterDelivery" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subscriberId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NewsletterDelivery_issueId_fkey" FOREIGN KEY ("issueId")
        REFERENCES "NewsletterIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterDelivery_issueId_email_key"
    ON "NewsletterDelivery"("issueId", "email");

CREATE INDEX IF NOT EXISTS "NewsletterDelivery_issueId_status_idx"
    ON "NewsletterDelivery"("issueId", "status");

-- +goose Down
DROP TABLE IF EXISTS "NewsletterDelivery";
DROP TABLE IF EXISTS "NewsletterIssue";
