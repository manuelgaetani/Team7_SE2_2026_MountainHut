-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('CONFIRMED', 'PENDING', 'REJECTED');

-- CreateTable
CREATE TABLE "slots" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_tables" (
    "slot_id" INTEGER NOT NULL,
    "table_number" INTEGER NOT NULL,
    "seats" INTEGER NOT NULL,

    CONSTRAINT "slot_tables_pkey" PRIMARY KEY ("slot_id","table_number")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "party_size" INTEGER NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_tables" (
    "booking_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "table_number" INTEGER NOT NULL,
    "assigned_seats" INTEGER NOT NULL,

    CONSTRAINT "booking_tables_pkey" PRIMARY KEY ("booking_id","slot_id","table_number")
);

-- CreateIndex
CREATE UNIQUE INDEX "slots_date_start_time_end_time_key" ON "slots"("date", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "bookings_slot_id_idx" ON "bookings"("slot_id");

-- AddForeignKey
ALTER TABLE "slot_tables" ADD CONSTRAINT "slot_tables_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_tables" ADD CONSTRAINT "booking_tables_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_tables" ADD CONSTRAINT "booking_tables_slot_id_table_number_fkey" FOREIGN KEY ("slot_id", "table_number") REFERENCES "slot_tables"("slot_id", "table_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE "slots" ADD CONSTRAINT "slots_time_range_check" CHECK ("end_time" > "start_time");
ALTER TABLE "slot_tables" ADD CONSTRAINT "slot_tables_seats_check" CHECK ("seats" > 0);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_party_size_check" CHECK ("party_size" > 0);
ALTER TABLE "booking_tables" ADD CONSTRAINT "booking_tables_assigned_seats_check" CHECK ("assigned_seats" > 0);