-- CreateEnum
CREATE TYPE "OAuthClientType" AS ENUM ('CONFIDENTIAL', 'PUBLIC');

-- CreateEnum
CREATE TYPE "OAuthClientStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "homepageUrl" TEXT,
    "redirectUris" TEXT[],
    "scopes" TEXT[] DEFAULT ARRAY['openid', 'profile', 'email']::TEXT[],
    "clientType" "OAuthClientType" NOT NULL DEFAULT 'CONFIDENTIAL',
    "status" "OAuthClientStatus" NOT NULL DEFAULT 'PENDING',
    "publicationId" TEXT,
    "ownerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "scopes" TEXT[],
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "scopes" TEXT[],
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClient_ownerUserId_idx" ON "OAuthClient"("ownerUserId");

-- CreateIndex
CREATE INDEX "OAuthClient_status_idx" ON "OAuthClient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_codeHash_key" ON "OAuthAuthorizationCode"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_clientId_idx" ON "OAuthAuthorizationCode"("clientId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_userId_idx" ON "OAuthAuthorizationCode"("userId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_accessTokenHash_key" ON "OAuthToken"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_refreshTokenHash_key" ON "OAuthToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_userId_idx" ON "OAuthToken"("clientId", "userId");

-- CreateIndex
CREATE INDEX "OAuthToken_refreshTokenHash_idx" ON "OAuthToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "OAuthToken_accessTokenExpiresAt_idx" ON "OAuthToken"("accessTokenExpiresAt");

-- CreateIndex
CREATE INDEX "OAuthConsent_userId_idx" ON "OAuthConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthConsent_clientId_userId_key" ON "OAuthConsent"("clientId", "userId");

-- AddForeignKey
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConsent" ADD CONSTRAINT "OAuthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConsent" ADD CONSTRAINT "OAuthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
