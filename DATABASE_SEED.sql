-- OrderFlow Database Seed (Idempotent)
-- Run this after migrations to populate demo data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Unique indexes for upserts
CREATE UNIQUE INDEX IF NOT EXISTS uix_store_meta_slug ON store_meta (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uix_categories_name ON categories (name);
CREATE UNIQUE INDEX IF NOT EXISTS uix_items_name ON items (name);
CREATE UNIQUE INDEX IF NOT EXISTS uix_modifiers_name ON modifiers (name);
CREATE UNIQUE INDEX IF NOT EXISTS uix_modifier_options_mod_label ON modifier_options (modifier_id, label);
CREATE UNIQUE INDEX IF NOT EXISTS uix_tables_label ON tables (label);
CREATE UNIQUE INDEX IF NOT EXISTS uix_profiles_email ON profiles (email);

-- Seed data with CTEs
WITH
store AS (
  INSERT INTO store_meta (id, slug, name, currency, default_language)
  VALUES (gen_random_uuid(), 'demo-cafe', 'Demo Café', 'EUR', 'en')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
),
cat_coffee AS (
  INSERT INTO categories (name, sort_order) VALUES ('Coffee', 1)
  ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id
),
cat_tea AS (
  INSERT INTO categories (name, sort_order) VALUES ('Tea', 2)
  ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id
),
cat_pastries AS (
  INSERT INTO categories (name, sort_order) VALUES ('Pastries', 3)
  ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id
),
item_espresso AS (
  INSERT INTO items (category_id, name, description, price_cents, available, sort_order)
  SELECT id, 'Espresso', 'Single shot', 250, TRUE, 1 FROM cat_coffee
  ON CONFLICT (name) DO UPDATE SET price_cents = EXCLUDED.price_cents
  RETURNING id
),
item_cappuccino AS (
  INSERT INTO items (category_id, name, description, price_cents, available, sort_order)
  SELECT id, 'Cappuccino', 'Espresso + milk foam', 350, TRUE, 2 FROM cat_coffee
  ON CONFLICT (name) DO UPDATE SET price_cents = EXCLUDED.price_cents
  RETURNING id
),
item_latte AS (
  INSERT INTO items (category_id, name, description, price_cents, available, sort_order)
  SELECT id, 'Latte', 'Mild milk coffee', 400, TRUE, 3 FROM cat_coffee
  ON CONFLICT (name) DO UPDATE SET price_cents = EXCLUDED.price_cents
  RETURNING id
),
item_croissant AS (
  INSERT INTO items (category_id, name, description, price_cents, available, sort_order)
  SELECT id, 'Croissant', 'Butter croissant', 220, TRUE, 1 FROM cat_pastries
  ON CONFLICT (name) DO UPDATE SET price_cents = EXCLUDED.price_cents
  RETURNING id
),
mod_milk AS (
  INSERT INTO modifiers (name) VALUES ('Milk')
  ON CONFLICT (name) DO NOTHING RETURNING id
),
mod_size AS (
  INSERT INTO modifiers (name) VALUES ('Size')
  ON CONFLICT (name) DO NOTHING RETURNING id
),
milk AS (SELECT id FROM mod_milk UNION ALL SELECT id FROM modifiers WHERE name='Milk' LIMIT 1),
size AS (SELECT id FROM mod_size UNION ALL SELECT id FROM modifiers WHERE name='Size' LIMIT 1),
opt_milk_oat AS (
  INSERT INTO modifier_options (modifier_id, label, price_delta_cents)
  SELECT id, 'Oat milk', 30 FROM milk
  ON CONFLICT (modifier_id, label) DO UPDATE SET price_delta_cents = EXCLUDED.price_delta_cents
  RETURNING id
),
opt_size_l AS (
  INSERT INTO modifier_options (modifier_id, label, price_delta_cents)
  SELECT id, 'Large', 100 FROM size
  ON CONFLICT (modifier_id, label) DO UPDATE SET price_delta_cents = EXCLUDED.price_delta_cents
  RETURNING id
),
t1 AS (
  INSERT INTO tables (label, active) VALUES ('T1', TRUE)
  ON CONFLICT (label) DO UPDATE SET active = EXCLUDED.active
  RETURNING id
),
t2 AS (
  INSERT INTO tables (label, active) VALUES ('T2', TRUE)
  ON CONFLICT (label) DO UPDATE SET active = EXCLUDED.active
  RETURNING id
),
w1 AS (
  INSERT INTO profiles (id, email, password_hash, role, display_name)
  VALUES (gen_random_uuid(), 'waiter1@demo.local',
          '$2b$12$tKaYb1N0WEG/9X9N8cQ5YESy0Yf8s2eRkC4hQFX8v4CwRRkHwT8aK',
          'waiter', 'Waiter 1')
  ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING id
),
mgr AS (
  INSERT INTO profiles (id, email, password_hash, role, display_name)
  VALUES (gen_random_uuid(), 'manager@demo.local',
          '$2b$12$tKaYb1N0WEG/9X9N8cQ5YESy0Yf8s2eRkC4hQFX8v4CwRRkHwT8aK',
          'manager', 'Manager')
  ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING id
)
SELECT 'Seed complete' AS status;

-- Assignments (after CTEs)
INSERT INTO waiter_tables (waiter_id, table_id)
SELECT (SELECT id FROM profiles WHERE email='waiter1@demo.local'),
       (SELECT id FROM tables WHERE label='T1')
ON CONFLICT DO NOTHING;

INSERT INTO waiter_tables (waiter_id, table_id)
SELECT (SELECT id FROM profiles WHERE email='waiter1@demo.local'),
       (SELECT id FROM tables WHERE label='T2')
ON CONFLICT DO NOTHING;
