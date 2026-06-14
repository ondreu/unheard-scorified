CREATE TABLE "character_equipment" (
	"character_id" uuid NOT NULL,
	"slot" varchar(32) NOT NULL,
	"item_id" varchar(64) NOT NULL,
	CONSTRAINT "character_equipment_character_id_slot_pk" PRIMARY KEY("character_id","slot")
);
--> statement-breakpoint
CREATE TABLE "character_inventory" (
	"character_id" uuid NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_inventory_character_id_item_id_pk" PRIMARY KEY("character_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "character_skins" (
	"account_id" uuid NOT NULL,
	"skin_id" varchar(64) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_skins_account_id_skin_id_pk" PRIMARY KEY("account_id","skin_id")
);
--> statement-breakpoint
CREATE TABLE "character_talents" (
	"character_id" uuid NOT NULL,
	"talent_id" varchar(64) NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "character_talents_character_id_talent_id_pk" PRIMARY KEY("character_id","talent_id")
);
--> statement-breakpoint
ALTER TABLE "character_equipment" ADD CONSTRAINT "character_equipment_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_skins" ADD CONSTRAINT "character_skins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_talents" ADD CONSTRAINT "character_talents_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;