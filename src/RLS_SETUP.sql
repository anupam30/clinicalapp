-- =========================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- Run this SQL in Supabase SQL Editor
-- =========================================

-- =========================================
-- STEP 1: ADD user_id COLUMN TO EXISTING TABLES
-- =========================================

-- Add user_id to member_data if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'member_data' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE member_data ADD COLUMN user_id UUID;
    RAISE NOTICE 'Added user_id column to member_data';
  ELSE
    RAISE NOTICE 'user_id column already exists in member_data';
  END IF;
END $$;

-- Add user_id to consultations if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'consultations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE consultations ADD COLUMN user_id UUID;
    RAISE NOTICE 'Added user_id column to consultations';
  ELSE
    RAISE NOTICE 'user_id column already exists in consultations';
  END IF;
END $$;

-- Add user_id to doctor_settings if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'doctor_settings' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE doctor_settings ADD COLUMN user_id UUID;
    RAISE NOTICE 'Added user_id column to doctor_settings';
  ELSE
    RAISE NOTICE 'user_id column already exists in doctor_settings';
  END IF;
END $$;

-- =========================================
-- STEP 2: CREATE INDEXES FOR PERFORMANCE
-- =========================================

-- Create index on user_id for member_data
CREATE INDEX IF NOT EXISTS idx_member_user ON member_data(user_id);

-- Create index on user_id for consultations  
CREATE INDEX IF NOT EXISTS idx_consultation_user ON consultations(user_id);

-- Create index on user_id for doctor_settings
CREATE INDEX IF NOT EXISTS idx_doctor_settings_user ON doctor_settings(user_id);

-- =========================================
-- STEP 3: ENABLE RLS ON ALL TABLES
-- =========================================

ALTER TABLE member_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_settings ENABLE ROW LEVEL SECURITY;

-- =========================================
-- STEP 4: DROP EXISTING POLICIES (if any)
-- =========================================

DROP POLICY IF EXISTS "Users can view their own patients" ON member_data;
DROP POLICY IF EXISTS "Users can insert their own patients" ON member_data;
DROP POLICY IF EXISTS "Users can update their own patients" ON member_data;
DROP POLICY IF EXISTS "Users can delete their own patients" ON member_data;

DROP POLICY IF EXISTS "Users can view their own consultations" ON consultations;
DROP POLICY IF EXISTS "Users can insert their own consultations" ON consultations;
DROP POLICY IF EXISTS "Users can update their own consultations" ON consultations;
DROP POLICY IF EXISTS "Users can delete their own consultations" ON consultations;

DROP POLICY IF EXISTS "Users can view their own settings" ON doctor_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON doctor_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON doctor_settings;

-- =========================================
-- STEP 5: CREATE RLS POLICIES FOR member_data
-- =========================================

-- SELECT: Users can only view their own patients
CREATE POLICY "Users can view their own patients"
ON member_data
FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: Users can only create patients for themselves
CREATE POLICY "Users can insert their own patients"
ON member_data
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own patients
CREATE POLICY "Users can update their own patients"
ON member_data
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own patients
CREATE POLICY "Users can delete their own patients"
ON member_data
FOR DELETE
USING (auth.uid() = user_id);

-- =========================================
-- STEP 6: CREATE RLS POLICIES FOR consultations
-- =========================================

-- SELECT: Users can only view their own consultations
CREATE POLICY "Users can view their own consultations"
ON consultations
FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: Users can only create consultations for themselves
CREATE POLICY "Users can insert their own consultations"
ON consultations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own consultations
CREATE POLICY "Users can update their own consultations"
ON consultations
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own consultations
CREATE POLICY "Users can delete their own consultations"
ON consultations
FOR DELETE
USING (auth.uid() = user_id);

-- =========================================
-- STEP 7: CREATE RLS POLICIES FOR doctor_settings
-- =========================================

-- SELECT: Users can only view their own settings
CREATE POLICY "Users can view their own settings"
ON doctor_settings
FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: Users can only create settings for themselves
CREATE POLICY "Users can insert their own settings"
ON doctor_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own settings
CREATE POLICY "Users can update their own settings"
ON doctor_settings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =========================================
-- STEP 8: GRANT PERMISSIONS TO AUTHENTICATED USERS
-- =========================================

-- Grant SELECT, INSERT, UPDATE, DELETE to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON member_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON consultations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON doctor_settings TO authenticated;

-- =========================================
-- STEP 9: UPDATE EXISTING DATA (OPTIONAL)
-- This links existing data to the first user in auth.users
-- Only run this if you have existing test data to preserve
-- =========================================

-- Uncomment these lines ONLY if you want to link existing data to a user:
-- 
-- -- Get the first user's ID
-- DO $$ 
-- DECLARE
--   first_user_id UUID;
-- BEGIN
--   SELECT id INTO first_user_id FROM auth.users LIMIT 1;
--   
--   IF first_user_id IS NOT NULL THEN
--     -- Update member_data where user_id is NULL
--     UPDATE member_data SET user_id = first_user_id WHERE user_id IS NULL;
--     RAISE NOTICE 'Updated member_data with user_id: %', first_user_id;
--     
--     -- Update consultations where user_id is NULL
--     UPDATE consultations SET user_id = first_user_id WHERE user_id IS NULL;
--     RAISE NOTICE 'Updated consultations with user_id: %', first_user_id;
--     
--     -- Update doctor_settings where user_id is NULL
--     UPDATE doctor_settings SET user_id = first_user_id WHERE user_id IS NULL;
--     RAISE NOTICE 'Updated doctor_settings with user_id: %', first_user_id;
--   ELSE
--     RAISE NOTICE 'No users found in auth.users';
--   END IF;
-- END $$;

-- =========================================
-- VERIFICATION QUERIES
-- Run these to verify RLS is working
-- =========================================

-- Check user_id column exists
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name IN ('member_data', 'consultations', 'doctor_settings')
  AND column_name = 'user_id';
-- Should show user_id column in all 3 tables

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('member_data', 'consultations', 'doctor_settings');
-- Should show rowsecurity = true for all tables

-- Check policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('member_data', 'consultations', 'doctor_settings')
ORDER BY tablename, policyname;
-- Should show all policies created above

-- =========================================
-- SUCCESS!
-- =========================================
-- ✅ user_id column added to all tables
-- ✅ Indexes created for performance
-- ✅ Row Level Security enabled
-- ✅ Security policies created
-- ✅ Permissions granted
-- 
-- Your application is now secure!
-- Users can ONLY access their own data.
-- =========================================
