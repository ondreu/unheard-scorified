ALTER TABLE "characters" ADD COLUMN "background" varchar(32);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "base_scores" jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "backstory" varchar(500);