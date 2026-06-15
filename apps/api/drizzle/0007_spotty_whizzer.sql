CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_character_id" uuid NOT NULL,
	"seller_account_id" uuid NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"quantity" integer NOT NULL,
	"start_bid" integer NOT NULL,
	"buyout" integer,
	"current_bid" integer,
	"bidder_character_id" uuid,
	"bidder_account_id" uuid,
	"deposit" integer NOT NULL,
	"duration" varchar(8) NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"winner_character_id" uuid,
	"final_price" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_character_id_characters_id_fk" FOREIGN KEY ("seller_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_account_id_accounts_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_bidder_character_id_characters_id_fk" FOREIGN KEY ("bidder_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_bidder_account_id_accounts_id_fk" FOREIGN KEY ("bidder_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winner_character_id_characters_id_fk" FOREIGN KEY ("winner_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;