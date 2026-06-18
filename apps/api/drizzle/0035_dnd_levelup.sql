ALTER TABLE "characters" ADD COLUMN "subclass" varchar(64);--> statement-breakpoint
DROP TABLE "character_talents" CASCADE;--> statement-breakpoint
CREATE TABLE "character_levelup_choices" (
	"character_id" uuid NOT NULL,
	"slot_id" varchar(32) NOT NULL,
	"choice" jsonb NOT NULL,
	CONSTRAINT "character_levelup_choices_character_id_slot_id_pk" PRIMARY KEY("character_id","slot_id")
);
--> statement-breakpoint
ALTER TABLE "character_levelup_choices" ADD CONSTRAINT "character_levelup_choices_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
