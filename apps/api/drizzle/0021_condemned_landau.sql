CREATE TABLE "character_mounts" (
	"character_id" uuid NOT NULL,
	"mount_id" varchar(64) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_mounts_character_id_mount_id_pk" PRIMARY KEY("character_id","mount_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "active_mount_id" varchar(64);--> statement-breakpoint
ALTER TABLE "character_mounts" ADD CONSTRAINT "character_mounts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;