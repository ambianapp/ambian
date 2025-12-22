-- Update the has_active_subscription function to include pending_payment status
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id 
    AND status IN ('active', 'trialing', 'pending_payment')
    AND (current_period_end IS NULL OR current_period_end > now())
  )
$$;