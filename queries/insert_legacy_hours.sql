-- Insert Legacy Hours Totals
-- One-time backfill: inserts a lump-sum hours total per student into
-- public.legacy_hours, resolving homebase_id by matching name against
-- public.profiles (case-insensitive).
--
-- Three names carry a "(CIT)" suffix in the source list that will not be
-- present in profiles.name, so the suffix is stripped before matching.
--
-- Run the CHECK query first — it lists any name that fails to resolve to
-- exactly one profile, so you can fix typos/duplicates before inserting.

-- ============================================================================
-- 1. CHECK — run first, should return zero rows before you insert
-- ============================================================================
WITH legacy_totals (name, hours) AS (
  VALUES
    ('Brooke Mathis', 1502.74),
    ('Brittney Dearing', 1189.63),
    ('Lindsey Parker', 764.96),
    ('Bailey Elder', 652.88),
    ('Yesneia Amezola', 1500.44),
    ('Madisyn Bishop', 702.54),
    ('Kylie Cannon', 1173.53),
    ('Ava McConnell', 1312.73),
    ('Savannah Coviak', 1026.28),
    ('Victoria Parrish', 1124.86),
    ('Mylee Garner', 990.64),
    ('Ellison Tucker', 1076.48),
    ('Emily Sistrunk', 496.62),
    ('Hanna Gilbert', 431.33),
    ('Ashley Roque', 1189),
    ('Kloe Burton', 383.07),
    ('Hope McCalanhan', 1082.73),
    ('Rena Marks', 650.42),
    ('Erica Johnson', 552.87),
    ('Breanna Welsh', 578.42),
    ('Saydee Rollet', 646.75),
    ('Peyton Hamilton', 685.33),
    ('Katie Wilbourn', 661.77),
    ('Sydney Hatfield', 1151.54),
    ('Sonya Mauer', 694.29),
    ('Danielle Overton (CIT)', 169.03),
    ('Joanna Bates (CIT)', 464.41),
    ('Gabby Gibbons (CIT)', 464.65),
    ('Adisen Storkson', 717.43),
    ('Silvia Pascual', 701.99),
    ('Ronnia Elliott', 539.52),
    ('Lorie Teague', 486.23),
    ('Taylor French', 619.34),
    ('Stephanie Polito', 388.44),
    ('Alisther Sanchez', 717.62),
    ('Katelyn Richardson', 421.67),
    ('Reese Rodgers', 484.36),
    ('Lauren Elliot', 455.22),
    ('Savannah Hogan', 514.54),
    ('Jayda Miller', 1155.58),
    ('Olivia Smith', 170.37),
    ('Allyson Anderson', 902.54),
    ('Jasmine White', 203.85),
    ('Kalli Cottingham', 220.48)
),
legacy_totals_clean AS (
  SELECT
    name AS raw_name,
    trim(regexp_replace(name, '\s*\([^)]*\)\s*$', '')) AS match_name,
    hours
  FROM legacy_totals
)
SELECT
  lt.raw_name,
  lt.match_name,
  count(p.homebase_id) AS matches
FROM legacy_totals_clean lt
LEFT JOIN public.profiles p ON lower(p.name) = lower(lt.match_name)
GROUP BY lt.raw_name, lt.match_name
HAVING count(p.homebase_id) <> 1
ORDER BY lt.raw_name;

-- ============================================================================
-- 2. INSERT — run once the check above returns zero rows
-- ============================================================================
WITH legacy_totals (name, hours) AS (
  VALUES
    ('Brooke Mathis', 1502.74),
    ('Brittney Dearing', 1189.63),
    ('Lindsey Parker', 764.96),
    ('Bailey Elder', 652.88),
    ('Yesneia Amezola', 1500.44),
    ('Madisyn Bishop', 702.54),
    ('Kylie Cannon', 1173.53),
    ('Ava McConnell', 1312.73),
    ('Savannah Coviak', 1026.28),
    ('Victoria Parrish', 1124.86),
    ('Mylee Garner', 990.64),
    ('Ellison Tucker', 1076.48),
    ('Emily Sistrunk', 496.62),
    ('Hanna Gilbert', 431.33),
    ('Ashley Roque', 1189),
    ('Kloe Burton', 383.07),
    ('Hope McCalanhan', 1082.73),
    ('Rena Marks', 650.42),
    ('Erica Johnson', 552.87),
    ('Breanna Welsh', 578.42),
    ('Saydee Rollet', 646.75),
    ('Peyton Hamilton', 685.33),
    ('Katie Wilbourn', 661.77),
    ('Sydney Hatfield', 1151.54),
    ('Sonya Mauer', 694.29),
    ('Danielle Overton (CIT)', 169.03),
    ('Joanna Bates (CIT)', 464.41),
    ('Gabby Gibbons (CIT)', 464.65),
    ('Adisen Storkson', 717.43),
    ('Silvia Pascual', 701.99),
    ('Ronnia Elliott', 539.52),
    ('Lorie Teague', 486.23),
    ('Taylor French', 619.34),
    ('Stephanie Polito', 388.44),
    ('Alisther Sanchez', 717.62),
    ('Katelyn Richardson', 421.67),
    ('Reese Rodgers', 484.36),
    ('Lauren Elliot', 455.22),
    ('Savannah Hogan', 514.54),
    ('Jayda Miller', 1155.58),
    ('Olivia Smith', 170.37),
    ('Allyson Anderson', 902.54),
    ('Jasmine White', 203.85),
    ('Kalli Cottingham', 220.48)
),
legacy_totals_clean AS (
  SELECT
    name AS raw_name,
    trim(regexp_replace(name, '\s*\([^)]*\)\s*$', '')) AS match_name,
    hours
  FROM legacy_totals
)
INSERT INTO public.legacy_hours (homebase_id, hours)
SELECT p.homebase_id, lt.hours
FROM legacy_totals_clean lt
JOIN public.profiles p ON lower(p.name) = lower(lt.match_name);
