CREATE TABLE "character_lockouts" (
	"character_id" uuid NOT NULL,
	"lockout_id" varchar(48) NOT NULL,
	"week_id" varchar(16) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_lockouts_character_id_lockout_id_week_id_pk" PRIMARY KEY("character_id","lockout_id","week_id")
);
--> statement-breakpoint
ALTER TABLE "character_lockouts" ADD CONSTRAINT "character_lockouts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;