CREATE TABLE "character_rotations" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_rotations" ADD CONSTRAINT "character_rotations_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;