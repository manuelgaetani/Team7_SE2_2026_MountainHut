-- CreateTable
CREATE TABLE "party_requirements" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "allergies" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "party_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "party_requirements_booking_id_idx" ON "party_requirements"("booking_id");

-- AddForeignKey
ALTER TABLE "party_requirements" ADD CONSTRAINT "party_requirements_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the requirements typed before MH-05: each free text becomes one requirement.
-- The old text does not say whether it was about allergies, so it is flagged as such:
-- a wrong warning is safer for the kitchen than a missing one.
INSERT INTO "party_requirements" ("booking_id", "allergies", "description")
SELECT "id", true, btrim("requirements")
FROM "bookings"
WHERE btrim("requirements") <> '';

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "requirements";