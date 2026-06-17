CREATE TABLE "character_bank" (
	"character_id" uuid NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_bank_character_id_item_id_pk" PRIMARY KEY("character_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "character_bank" ADD CONSTRAINT "character_bank_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;