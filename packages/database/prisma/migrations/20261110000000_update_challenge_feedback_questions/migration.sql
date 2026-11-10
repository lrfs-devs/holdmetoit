-- AlterTable
ALTER TABLE "ChallengeFeedback" ADD COLUMN "joinReason" TEXT;
ALTER TABLE "ChallengeFeedback" ALTER COLUMN "soloPunishment" DROP NOT NULL;
ALTER TABLE "ChallengeFeedback" ALTER COLUMN "trackingPreference" DROP NOT NULL;
ALTER TABLE "ChallengeFeedback" ALTER COLUMN "workSchoolHours" DROP NOT NULL;
ALTER TABLE "ChallengeFeedback" ALTER COLUMN "soloStyle" DROP NOT NULL;
