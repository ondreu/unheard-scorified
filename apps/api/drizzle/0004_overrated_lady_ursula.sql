CREATE TABLE "character_professions" (
	"character_id" uuid NOT NULL,
	"profession_id" varchar(32) NOT NULL,
	"skill" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "character_professions_character_id_profession_id_pk" PRIMARY KEY("character_id","profession_id")
);
--> statement-breakpoint
CREATE TABLE "character_reputation" (
	"character_id" uuid NOT NULL,
	"faction_id" varchar(32) NOT NULL,
	"standing" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "character_reputation_character_id_faction_id_pk" PRIMARY KEY("character_id","faction_id")
);
--> statement-breakpoint
ALTER TABLE "character_professions" ADD CONSTRAINT "character_professions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_reputation" ADD CONSTRAINT "character_reputation_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;