CREATE TABLE "character_bags" (
	"character_id" uuid NOT NULL,
	"slot_index" integer NOT NULL,
	"bag_id" varchar(64) NOT NULL,
	CONSTRAINT "character_bags_character_id_slot_index_pk" PRIMARY KEY("character_id","slot_index")
);
--> statement-breakpoint
ALTER TABLE "character_bags" ADD CONSTRAINT "character_bags_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;