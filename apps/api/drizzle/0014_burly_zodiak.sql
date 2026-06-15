CREATE TABLE "raid_lobbies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raid_id" varchar(32) NOT NULL,
	"leader_character_id" uuid NOT NULL,
	"size" integer NOT NULL,
	"composition" jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'forming' NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid_lobby_members" (
	"lobby_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" varchar(8) NOT NULL,
	"status" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raid_lobby_members_lobby_id_character_id_pk" PRIMARY KEY("lobby_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "raid_lobbies" ADD CONSTRAINT "raid_lobbies_leader_character_id_characters_id_fk" FOREIGN KEY ("leader_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_lobbies" ADD CONSTRAINT "raid_lobbies_run_id_raid_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."raid_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_lobby_members" ADD CONSTRAINT "raid_lobby_members_lobby_id_raid_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."raid_lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_lobby_members" ADD CONSTRAINT "raid_lobby_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;