CREATE TABLE "character_buffs" (
	"character_id" uuid NOT NULL,
	"consumable_id" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "character_buffs_character_id_consumable_id_pk" PRIMARY KEY("character_id","consumable_id")
);
--> statement-breakpoint
ALTER TABLE "character_buffs" ADD CONSTRAINT "character_buffs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;