-- Add column for stair upgrade type (allows tracking which stair upgrade was selected)
-- Values: null (standard carpet), 'lvp' (standard LVP), 'premium_lvp' (premium LVP)
ALTER TABLE buyer_selections ADD COLUMN stair_upgrade_type text DEFAULT NULL;