CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" varchar(16) NOT NULL,
	"sender_character_id" uuid,
	"sender_name" varchar(16) NOT NULL,
	"body" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_character_id_characters_id_fk" FOREIGN KEY ("sender_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;