-- Add scheduling_enabled column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN scheduling_enabled boolean NOT NULL DEFAULT false;