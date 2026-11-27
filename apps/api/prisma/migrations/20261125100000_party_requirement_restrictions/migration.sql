-- Needs picked from the list of the hut; the description keeps only what is not in the list.
ALTER TABLE "party_requirements" ADD COLUMN "restrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
