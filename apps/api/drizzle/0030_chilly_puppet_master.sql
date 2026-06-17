CREATE TABLE "npc_auction_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"listing_id" varchar(48) NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"bought_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npc_auction_purchases_character_id_listing_id_unique" UNIQUE("character_id","listing_id")
);
--> statement-breakpoint
ALTER TABLE "npc_auction_purchases" ADD CONSTRAINT "npc_auction_purchases_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;