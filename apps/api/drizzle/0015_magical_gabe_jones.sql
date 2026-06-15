CREATE TABLE "trade_items" (
	"trade_id" uuid NOT NULL,
	"side" varchar(10) NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "trade_items_trade_id_side_item_id_pk" PRIMARY KEY("trade_id","side","item_id")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiator_character_id" uuid NOT NULL,
	"partner_character_id" uuid NOT NULL,
	"initiator_gold" integer DEFAULT 0 NOT NULL,
	"partner_gold" integer DEFAULT 0 NOT NULL,
	"initiator_confirmed" integer DEFAULT 0 NOT NULL,
	"partner_confirmed" integer DEFAULT 0 NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_initiator_character_id_characters_id_fk" FOREIGN KEY ("initiator_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_partner_character_id_characters_id_fk" FOREIGN KEY ("partner_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;