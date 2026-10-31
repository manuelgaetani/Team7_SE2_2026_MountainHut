-- A hiker can have only one booking for a slot. A rejected booking does not count.
-- Prisma cannot express a partial index in schema.prisma, so it exists only here.
CREATE UNIQUE INDEX "bookings_hiker_id_slot_id_active_key" ON "bookings"("hiker_id", "slot_id") WHERE "status" <> 'REJECTED';
