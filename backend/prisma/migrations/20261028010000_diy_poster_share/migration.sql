-- CreateTable
CREATE TABLE "diy_poster_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "owner_id" INTEGER NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "diy_poster_shares_token_key" ON "diy_poster_shares"("token");

-- CreateIndex
CREATE INDEX "diy_poster_shares_owner_id_idx" ON "diy_poster_shares"("owner_id");
