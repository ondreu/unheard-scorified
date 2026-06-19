CREATE TABLE "dungeon_turn_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"dungeon_id" varchar(64) NOT NULL,
	"player_snapshot" jsonb NOT NULL,
	"level" integer NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"state" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"encounters_cleared" integer DEFAULT 0 NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dungeon_turn_runs" ADD CONSTRAINT "dungeon_turn_runs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;