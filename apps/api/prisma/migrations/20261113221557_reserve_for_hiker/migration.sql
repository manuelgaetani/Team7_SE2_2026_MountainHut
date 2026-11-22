-- AlterTable
ALTER TABLE "hikers" ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A hiker with an account must have a phone; only temporary hikers can miss it.
ALTER TABLE "hikers" ADD CONSTRAINT "hikers_phone_required_with_account" CHECK ("user_id" IS NULL OR "phone" IS NOT NULL);