CREATE TABLE "dungeon_party_participants" (
	"run_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" varchar(8) NOT NULL,
	"initiator" integer DEFAULT 0 NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dungeon_party_participants_run_id_character_id_pk" PRIMARY KEY("run_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "dungeon_party_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dungeon_id" varchar(64) NOT NULL,
	"leader_character_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"size" integer NOT NULL,
	"state" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"encounters_cleared" integer DEFAULT 0 NOT NULL,
	"round_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dungeon_party_participants" ADD CONSTRAINT "dungeon_party_participants_run_id_dungeon_party_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."dungeon_party_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_party_participants" ADD CONSTRAINT "dungeon_party_participants_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_party_runs" ADD CONSTRAINT "dungeon_party_runs_leader_character_id_characters_id_fk" FOREIGN KEY ("leader_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;