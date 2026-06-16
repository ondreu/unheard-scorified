CREATE TABLE "character_event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"title" varchar(160) NOT NULL,
	"detail" varchar(240) DEFAULT '' NOT NULL,
	"outcome" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_event_log" ADD CONSTRAINT "character_event_log_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;