-- A refused note can't just be dismissed any more: you either rewrite it and send it again, or drop its
-- action and say why (the AI checks that reason too). The reason for dropping is kept here.
ALTER TABLE reason_queue ADD COLUMN drop_reason TEXT;
