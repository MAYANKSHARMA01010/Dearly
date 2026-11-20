ALTER TABLE "draft_recipients" DROP CONSTRAINT "draft_recipients_destination_shape";
ALTER TABLE "draft_recipients" ADD CONSTRAINT "draft_recipients_destination_shape" CHECK (
 ("type" IN ('SELF','USER') AND "phone" IS NULL AND "country" IS NULL AND "email" IS NULL) OR
 ("type"='PHONE' AND "phone" IS NOT NULL AND "country" IS NOT NULL AND "email" IS NULL) OR
 ("type"='EMAIL' AND "phone" IS NULL AND "country" IS NULL AND "email" IS NOT NULL)
);
