CREATE TABLE "character_goal_claims" (
	"character_id" uuid NOT NULL,
	"goal_id" varchar(48) NOT NULL,
	"period_id" varchar(16) NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_goal_claims_character_id_goal_id_period_id_pk" PRIMARY KEY("character_id","goal_id","period_id")
);
--> statement-breakpoint
ALTER TABLE "character_goal_claims" ADD CONSTRAINT "character_goal_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;