CREATE TABLE "raid_run_participants" (
	"raid_run_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" varchar(8) NOT NULL,
	"initiator" integer DEFAULT 0 NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raid_run_participants_raid_run_id_character_id_pk" PRIMARY KEY("raid_run_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "raid_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raid_id" varchar(32) NOT NULL,
	"party" jsonb NOT NULL,
	"seed" bigint NOT NULL,
	"victory" integer NOT NULL,
	"duration_sec" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raid_run_participants" ADD CONSTRAINT "raid_run_participants_raid_run_id_raid_runs_id_fk" FOREIGN KEY ("raid_run_id") REFERENCES "public"."raid_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_run_participants" ADD CONSTRAINT "raid_run_participants_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;