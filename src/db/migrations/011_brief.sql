-- A short free-text brief per product ("habits must be countable, nothing about weight loss").
-- It is added to the AI's instructions for the wording of the pages and the listing, and it
-- carries over to every new version and variation of the product.
ALTER TABLE product_specs ADD COLUMN brief TEXT NOT NULL DEFAULT '';
