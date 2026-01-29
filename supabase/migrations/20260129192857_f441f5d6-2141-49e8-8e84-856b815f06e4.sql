-- Add Premium LVP upgrade option for stairs ($3145 pre-GST)
INSERT INTO pricing_config (config_key, config_value, is_percentage, is_active, description)
VALUES ('stair_premium_lvp_upgrade_price', 3145.00, false, true, 'Premium LVP with custom flush stair nosings (higher grade upgrade)');