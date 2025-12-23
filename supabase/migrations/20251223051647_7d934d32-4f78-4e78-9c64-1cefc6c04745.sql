-- Remove hardcoded admin email trigger and function
-- Admins should be granted manually via database, not auto-assigned on signup

-- Drop the trigger first
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

-- Drop the function
DROP FUNCTION IF EXISTS public.handle_admin_on_signup();