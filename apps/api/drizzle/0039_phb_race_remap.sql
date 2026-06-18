-- MR (PHB rasy): přemapování starých WoW race id na nové D&D PHB rasy.
-- Data-only migrace (schéma `race` zůstává varchar). Beze ztráty postav.
UPDATE "characters" SET "race" = 'elf' WHERE "race" = 'nightelf';
--> statement-breakpoint
UPDATE "characters" SET "race" = 'half_orc' WHERE "race" = 'orc';
--> statement-breakpoint
UPDATE "characters" SET "race" = 'dragonborn' WHERE "race" = 'tauren';
--> statement-breakpoint
UPDATE "characters" SET "race" = 'half_elf' WHERE "race" = 'troll';
--> statement-breakpoint
UPDATE "characters" SET "race" = 'tiefling' WHERE "race" = 'undead';
