CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "recipient" TEXT NOT NULL,
  "provider" TEXT,
  "providerId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "dedupeKey" TEXT NOT NULL,

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key"
  ON "NotificationDelivery"("dedupeKey");
CREATE INDEX "NotificationDelivery_status_availableAt_idx"
  ON "NotificationDelivery"("status", "availableAt");
CREATE INDEX "NotificationDelivery_notificationId_idx"
  ON "NotificationDelivery"("notificationId");
CREATE INDEX "NotificationDelivery_recipient_channel_status_idx"
  ON "NotificationDelivery"("recipient", "channel", "status");

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
