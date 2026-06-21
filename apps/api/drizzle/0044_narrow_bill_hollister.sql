CREATE TABLE "character_bestiary" (
	"character_id" uuid NOT NULL,
	"enemy_template_id" varchar(48) NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_bestiary_character_id_enemy_template_id_pk" PRIMARY KEY("character_id","enemy_template_id")
);
--> statement-breakpoint
ALTER TABLE "character_bestiary" ADD CONSTRAINT "character_bestiary_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;