-- CreateTable
CREATE TABLE "mail_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gmail_address" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "history_id" TEXT,
    "watch_expires_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mail_account_id" UUID NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "from_address" TEXT NOT NULL,
    "from_domain" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "processing_status" TEXT NOT NULL,
    "ignore_reason" TEXT,
    "receipt_kind" TEXT,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mail_message_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "merchant_name" TEXT NOT NULL,
    "merchant_domain" TEXT,
    "order_id" TEXT,
    "order_url" TEXT,
    "total_amount_minor_units" INTEGER,
    "total_amount_currency" TEXT,
    "occurred_at" TIMESTAMP(3),
    "line_items_json" JSONB NOT NULL,
    "extracted_at" TIMESTAMP(3) NOT NULL,
    "extraction_source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_receipt_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "match_score" INTEGER NOT NULL,
    "match_reason" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_receipt_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_accounts_gmail_address_key" ON "mail_accounts"("gmail_address");

-- CreateIndex
CREATE INDEX "mail_accounts_user_id_idx" ON "mail_accounts"("user_id");

-- CreateIndex
CREATE INDEX "mail_messages_user_id_idx" ON "mail_messages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mail_messages_mail_account_id_gmail_message_id_key" ON "mail_messages"("mail_account_id", "gmail_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_mail_message_id_key" ON "receipts"("mail_message_id");

-- CreateIndex
CREATE INDEX "receipts_user_id_idx" ON "receipts"("user_id");

-- CreateIndex
CREATE INDEX "receipts_user_id_extracted_at_idx" ON "receipts"("user_id", "extracted_at");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_receipt_links_transaction_id_key" ON "transaction_receipt_links"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_receipt_links_receipt_id_key" ON "transaction_receipt_links"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_receipt_links_user_id_transaction_id_key" ON "transaction_receipt_links"("user_id", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_receipt_links_user_id_receipt_id_key" ON "transaction_receipt_links"("user_id", "receipt_id");

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "mail_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_mail_account_id_fkey" FOREIGN KEY ("mail_account_id") REFERENCES "mail_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_mail_message_id_fkey" FOREIGN KEY ("mail_message_id") REFERENCES "mail_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_receipt_links" ADD CONSTRAINT "transaction_receipt_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_receipt_links" ADD CONSTRAINT "transaction_receipt_links_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_receipt_links" ADD CONSTRAINT "transaction_receipt_links_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
