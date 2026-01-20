-- Create referral partners table
CREATE TABLE public.referral_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  commission_duration_months INTEGER NOT NULL DEFAULT 12,
  stripe_connect_account_id TEXT,
  stripe_connect_status TEXT DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referral signups table (tracks which users came from which partner)
CREATE TABLE public.referral_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  free_months_granted INTEGER NOT NULL DEFAULT 2,
  subscription_start_date TIMESTAMP WITH TIME ZONE,
  commission_end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create referral commissions table (tracks individual commission payments)
CREATE TABLE public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  referral_signup_id UUID NOT NULL REFERENCES public.referral_signups(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT,
  subscription_amount DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payout_id TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for referral_partners
CREATE POLICY "Admins can manage referral partners"
ON public.referral_partners
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for referral_signups
CREATE POLICY "Admins can manage referral signups"
ON public.referral_signups
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own referral signup"
ON public.referral_signups
FOR SELECT
USING (auth.uid() = user_id);

-- RLS policies for referral_commissions
CREATE POLICY "Admins can manage referral commissions"
ON public.referral_commissions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_referral_partners_code ON public.referral_partners(referral_code);
CREATE INDEX idx_referral_signups_partner ON public.referral_signups(partner_id);
CREATE INDEX idx_referral_signups_user ON public.referral_signups(user_id);
CREATE INDEX idx_referral_commissions_partner ON public.referral_commissions(partner_id);
CREATE INDEX idx_referral_commissions_status ON public.referral_commissions(status);

-- Add trigger for updated_at
CREATE TRIGGER update_referral_partners_updated_at
BEFORE UPDATE ON public.referral_partners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();