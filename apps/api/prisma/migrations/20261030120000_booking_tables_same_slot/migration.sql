-- A table assignment must belong to the same slot as its booking.

-- DropForeignKey
ALTER TABLE "booking_tables" DROP CONSTRAINT "booking_tables_booking_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "bookings_id_slot_id_key" ON "bookings"("id", "slot_id");

-- AddForeignKey
ALTER TABLE "booking_tables" ADD CONSTRAINT "booking_tables_booking_id_slot_id_fkey" FOREIGN KEY ("booking_id", "slot_id") REFERENCES "bookings"("id", "slot_id") ON DELETE RESTRICT ON UPDATE CASCADE;
