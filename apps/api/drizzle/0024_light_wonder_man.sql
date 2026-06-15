CREATE TABLE "mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_character_id" uuid NOT NULL,
	"from_character_id" uuid,
	"from_name" varchar(16) NOT NULL,
	"subject" varchar(64) NOT NULL,
	"body" varchar(512) DEFAULT '' NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone,
	"claimed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mail_id" uuid NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail" ADD CONSTRAINT "mail_to_character_id_characters_id_fk" FOREIGN KEY ("to_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail" ADD CONSTRAINT "mail_from_character_id_characters_id_fk" FOREIGN KEY ("from_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_items" ADD CONSTRAINT "mail_items_mail_id_mail_id_fk" FOREIGN KEY ("mail_id") REFERENCES "public"."mail"("id") ON DELETE cascade ON UPDATE no action;