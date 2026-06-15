CREATE TABLE "arena_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"bracket" varchar(8) NOT NULL,
	"a_character_id" uuid NOT NULL,
	"b_character_id" uuid NOT NULL,
	"a_snapshot" jsonb NOT NULL,
	"b_snapshot" jsonb NOT NULL,
	"seed" bigint NOT NULL,
	"winner" varchar(1) NOT NULL,
	"duration_sec" integer NOT NULL,
	"a_rating_before" integer NOT NULL,
	"a_rating_after" integer NOT NULL,
	"b_rating_before" integer NOT NULL,
	"b_rating_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_ratings" (
	"character_id" uuid NOT NULL,
	"bracket" varchar(8) NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"rating" integer DEFAULT 1500 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_ratings_character_id_bracket_season_id_pk" PRIMARY KEY("character_id","bracket","season_id")
);
--> statement-breakpoint
CREATE TABLE "arena_season_rewards" (
	"character_id" uuid NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"bracket" varchar(8) NOT NULL,
	"final_rating" integer NOT NULL,
	"final_tier" varchar(16) NOT NULL,
	"reward_gold" integer NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_season_rewards_character_id_season_id_bracket_pk" PRIMARY KEY("character_id","season_id","bracket")
);
--> statement-breakpoint
ALTER TABLE "arena_matches" ADD CONSTRAINT "arena_matches_a_character_id_characters_id_fk" FOREIGN KEY ("a_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_matches" ADD CONSTRAINT "arena_matches_b_character_id_characters_id_fk" FOREIGN KEY ("b_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_ratings" ADD CONSTRAINT "arena_ratings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_season_rewards" ADD CONSTRAINT "arena_season_rewards_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;