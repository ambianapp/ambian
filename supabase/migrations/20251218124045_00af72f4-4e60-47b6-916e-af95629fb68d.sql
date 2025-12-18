-- Add RLS policies for users to manage their own subscriptions
-- This allows the check-subscription function to work without service role

-- Policy for users to insert their own subscription
CREATE POLICY "Users can insert own subscription" 
ON public.subscriptions 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own subscription
CREATE POLICY "Users can update own subscription" 
ON public.subscriptions 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);