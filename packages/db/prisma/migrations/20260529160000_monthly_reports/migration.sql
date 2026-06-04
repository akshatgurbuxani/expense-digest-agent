-- Monthly expense reports (G9)

CREATE TABLE "monthly_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year_month" TEXT NOT NULL,
    "month_start" TIMESTAMP(3) NOT NULL,
    "month_end" TIMESTAMP(3) NOT NULL,
    "facts_json" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monthly_reports_user_id_year_month_key" ON "monthly_reports"("user_id", "year_month");
CREATE INDEX "monthly_reports_user_id_idx" ON "monthly_reports"("user_id");

ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
