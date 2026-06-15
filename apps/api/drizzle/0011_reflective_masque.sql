CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_character_id" uuid NOT NULL,
	"addressee_character_id" uuid NOT NULL,
	"status" varchar(12) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_requester_character_id_addressee_character_id_unique" UNIQUE("requester_character_id","addressee_character_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_character_id_characters_id_fk" FOREIGN KEY ("requester_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_character_id_characters_id_fk" FOREIGN KEY ("addressee_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;