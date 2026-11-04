-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "booking_id" INTEGER;

-- CreateIndex
CREATE INDEX "notifications_booking_id_idx" ON "notifications"("booking_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
