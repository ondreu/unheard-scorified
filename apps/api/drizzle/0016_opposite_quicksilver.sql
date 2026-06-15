CREATE TABLE "arena_team_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"bracket" varchar(8) NOT NULL,
	"a_members" jsonb NOT NULL,
	"b_members" jsonb NOT NULL,
	"a_member_ids" jsonb NOT NULL,
	"b_member_ids" jsonb NOT NULL,
	"seed" bigint NOT NULL,
	"winner" varchar(1) NOT NULL,
	"duration_sec" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
