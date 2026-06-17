ALTER TABLE "chat_messages" ADD COLUMN "scope_id" uuid;--> statement-breakpoint
CREATE INDEX "chat_messages_channel_scope_idx" ON "chat_messages" USING btree ("channel","scope_id","created_at");