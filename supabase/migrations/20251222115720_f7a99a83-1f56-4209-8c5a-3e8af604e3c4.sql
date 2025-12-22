
-- Update the admin on signup trigger to include both admin emails
CREATE OR REPLACE FUNCTION public.handle_admin_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if the new user's email should be an admin
  IF NEW.email IN ('niklas.makinen@ambian.fi', 'niclas.heino@ambian.fi') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
