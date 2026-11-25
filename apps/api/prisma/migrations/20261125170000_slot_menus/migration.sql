-- MH-10: the menu of a slot, at most one, deleted with its slot.
-- CreateTable
CREATE TABLE "menus" (
    "slot_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("slot_id")
);

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
