-- Add Non Standard Color options to upgrade_materials table
-- These allow buyers to select a non-standard color for LVP, LVT, and Tile areas

INSERT INTO upgrade_materials (material_key, name, description, cost_per_unit, unit_type, is_active, display_order, parent_material_key)
VALUES 
  ('nonstandard_lvp', 'Non Standard LVP Color', 'Select a non-standard color from the LVP collection', 2.50, 'sqft', true, 15, 'lvp'),
  ('nonstandard_lvt', 'Non Standard LVT Color', 'Select a non-standard color from the LVT collection', 2.50, 'sqft', true, 16, 'lvt'),
  ('nonstandard_tile', 'Non Standard Tile Color', 'Select a non-standard color from the tile collection', 3.00, 'sqft', true, 17, 'tile')
ON CONFLICT (material_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;