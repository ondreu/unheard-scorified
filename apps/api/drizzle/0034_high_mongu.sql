CREATE TABLE "gauntlet_daily" (
	"character_id" uuid NOT NULL,
	"day_id" varchar(10) NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"gold_earned" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gauntlet_daily_character_id_day_id_pk" PRIMARY KEY("character_id","day_id")
);
--> statement-breakpoint
CREATE TABLE "gauntlet_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"player_snapshot" jsonb NOT NULL,
	"level" integer NOT NULL,
	"state" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"waves_cleared" integer DEFAULT 0 NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "gauntlet_daily" ADD CONSTRAINT "gauntlet_daily_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlet_runs" ADD CONSTRAINT "gauntlet_runs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;