-- A cancelled booking does not count, like a rejected one: the hiker can book the slot again.
-- Prisma cannot express a partial index in schema.prisma, so it exists only in the migrations.
DROP INDEX "bookings_hiker_id_slot_id_active_key";
CREATE UNIQUE INDEX "bookings_hiker_id_slot_id_active_key" ON "bookings"("hiker_id", "slot_id") WHERE "status" NOT IN ('REJECTED', 'CANCELLED');