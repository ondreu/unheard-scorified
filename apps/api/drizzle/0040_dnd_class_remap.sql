-- MR (D&D classy): přemapování starých WoW class id na nové D&D classy.
-- Protějšek 0039 (rasy) — při přechodu WoW→D&D (MR-2) se rasy přemapovaly,
-- ale třídy ne, takže postavy vytvořené před MR-2 zůstaly s neexistujícím
-- `class` (warrior/hunter/priest/shaman/mage). To pak shazovalo buildCharacterSheet
-- (CLASSES[class] === undefined) → 500 na GET /characters (jeden řádek shodí
-- celý seznam účtu). Data-only migrace (schéma `class` zůstává varchar).
UPDATE "characters" SET "class" = 'fighter' WHERE "class" = 'warrior';
--> statement-breakpoint
UPDATE "characters" SET "class" = 'ranger' WHERE "class" = 'hunter';
--> statement-breakpoint
UPDATE "characters" SET "class" = 'cleric' WHERE "class" = 'priest';
--> statement-breakpoint
UPDATE "characters" SET "class" = 'wizard' WHERE "class" = 'mage';
--> statement-breakpoint
UPDATE "characters" SET "class" = 'druid' WHERE "class" = 'shaman';
