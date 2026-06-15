CREATE TABLE "guild_charter_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charter_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"signed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_charter_signatures_charter_id_character_id_unique" UNIQUE("charter_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "guild_charters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(24) NOT NULL,
	"founder_character_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_charters_name_unique" UNIQUE("name"),
	CONSTRAINT "guild_charters_founder_character_id_unique" UNIQUE("founder_character_id")
);
--> statement-breakpoint
ALTER TABLE "guild_charter_signatures" ADD CONSTRAINT "guild_charter_signatures_charter_id_guild_charters_id_fk" FOREIGN KEY ("charter_id") REFERENCES "public"."guild_charters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_charter_signatures" ADD CONSTRAINT "guild_charter_signatures_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_charters" ADD CONSTRAINT "guild_charters_founder_character_id_characters_id_fk" FOREIGN KEY ("founder_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;