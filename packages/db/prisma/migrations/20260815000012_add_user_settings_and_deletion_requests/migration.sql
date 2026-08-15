CREATE TABLE "UserSettings" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "profileVisibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "allowMentions" BOOLEAN NOT NULL DEFAULT true,
  "allowCollaborationInvites" BOOLEAN NOT NULL DEFAULT true,
  "showSensitiveContent" BOOLEAN NOT NULL DEFAULT true,
  "autoplayMedia" BOOLEAN NOT NULL DEFAULT true,
  "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
  "highContrast" BOOLEAN NOT NULL DEFAULT false,
  "fontScale" INTEGER NOT NULL DEFAULT 100,
  "defaultFeed" TEXT NOT NULL DEFAULT 'FOLLOWING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountDeletionRequest_userId_status_idx"
  ON "AccountDeletionRequest"("userId", "status");
CREATE INDEX "AccountDeletionRequest_status_requestedAt_idx"
  ON "AccountDeletionRequest"("status", "requestedAt");

ALTER TABLE "UserSettings"
  ADD CONSTRAINT "UserSettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
