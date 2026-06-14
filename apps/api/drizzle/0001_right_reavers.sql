CREATE TABLE "character_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"activity_type" varchar(16) NOT NULL,
	"params" jsonb NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"duration_sec" integer NOT NULL,
	"seed" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_activities_character_id_unique" UNIQUE("character_id")
);
--> statement-breakpoint
CREATE TABLE "completed_quests" (
	"character_id" uuid NOT NULL,
	"quest_id" varchar(48) NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completed_quests_character_id_quest_id_pk" PRIMARY KEY("character_id","quest_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "gold" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_activities" ADD CONSTRAINT "character_activities_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_quests" ADD CONSTRAINT "completed_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;