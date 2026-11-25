-- MH-20: hikes of the hut's list and hikes registered by the hikers.

-- CreateTable
CREATE TABLE "predefined_hikes" (
    "id" SERIAL NOT NULL,
    "destination" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "passage_points" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "predefined_hikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hikes" (
    "id" SERIAL NOT NULL,
    "hiker_id" INTEGER NOT NULL,
    "predefined_hike_id" INTEGER,
    "destination" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "passage_points" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "departure_at" TIMESTAMP(0) NOT NULL,
    "return_at" TIMESTAMP(0) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hikes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "predefined_hikes_destination_route_key" ON "predefined_hikes"("destination", "route");

-- CreateIndex
CREATE INDEX "hikes_hiker_id_departure_at_idx" ON "hikes"("hiker_id", "departure_at");

-- CreateIndex
CREATE INDEX "hikes_predefined_hike_id_idx" ON "hikes"("predefined_hike_id");

-- AddForeignKey
ALTER TABLE "hikes" ADD CONSTRAINT "hikes_hiker_id_fkey" FOREIGN KEY ("hiker_id") REFERENCES "hikers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hikes" ADD CONSTRAINT "hikes_predefined_hike_id_fkey" FOREIGN KEY ("predefined_hike_id") REFERENCES "predefined_hikes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The expected return comes after the planned departure (issue #51).
ALTER TABLE "hikes" ADD CONSTRAINT "hikes_time_range_check" CHECK ("return_at" > "departure_at");
