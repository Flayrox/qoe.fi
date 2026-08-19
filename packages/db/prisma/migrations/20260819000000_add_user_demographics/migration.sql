-- AddUserDemographics
-- Collecte démographique optionnelle (genre, tranche d'âge, pays, langue)
-- déclarée explicitement par l'utilisateur à l'onboarding — jamais obligatoire.

CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY');
CREATE TYPE "AgeRange" AS ENUM ('UNDER_18', 'AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_64', 'AGE_65_PLUS', 'PREFER_NOT_TO_SAY');

ALTER TABLE "User"
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "ageRange" "AgeRange",
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "languageCode" TEXT,
  ADD COLUMN "demographicsUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "pronouns" TEXT;
