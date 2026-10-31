/*
  Warnings:

  - You are about to drop the column `user_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `first_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `is_temporary` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `users` table. All the data in the column will be lost.
  - Added the required column `hiker_id` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_user_id_fkey";

-- DropIndex
DROP INDEX "bookings_user_id_idx";

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "user_id",
ADD COLUMN     "hiker_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "first_name",
DROP COLUMN "is_temporary",
DROP COLUMN "last_name",
DROP COLUMN "phone",
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "password" SET NOT NULL;

-- CreateTable
CREATE TABLE "hikers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "emergency_contact" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hikers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hikers_user_id_key" ON "hikers"("user_id");

-- CreateIndex
CREATE INDEX "bookings_hiker_id_idx" ON "bookings"("hiker_id");

-- AddForeignKey
ALTER TABLE "hikers" ADD CONSTRAINT "hikers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hiker_id_fkey" FOREIGN KEY ("hiker_id") REFERENCES "hikers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
