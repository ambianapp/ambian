-- Create industry collections table
CREATE TABLE public.industry_collections (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    cover_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create junction table for collection playlists
CREATE TABLE public.industry_collection_playlists (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES public.industry_collections(id) ON DELETE CASCADE,
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(collection_id, playlist_id)
);

-- Enable RLS
ALTER TABLE public.industry_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_collection_playlists ENABLE ROW LEVEL SECURITY;

-- RLS policies for industry_collections
CREATE POLICY "Anyone can view active collections"
ON public.industry_collections
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage collections"
ON public.industry_collections
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for industry_collection_playlists
CREATE POLICY "Anyone can view collection playlists"
ON public.industry_collection_playlists
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.industry_collections
    WHERE id = collection_id AND is_active = true
));

CREATE POLICY "Admins can manage collection playlists"
ON public.industry_collection_playlists
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_industry_collections_updated_at
BEFORE UPDATE ON public.industry_collections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default industry collections
INSERT INTO public.industry_collections (name, description, icon, display_order) VALUES
('Spa & Wellness', 'Relaxing music for spa treatments and wellness centers', 'Sparkles', 1),
('Beauty Salon', 'Stylish tunes for hair salons and beauty studios', 'Scissors', 2),
('Gym & Fitness', 'High-energy beats for workouts and training', 'Dumbbell', 3),
('Restaurant & Café', 'Perfect ambiance for dining experiences', 'UtensilsCrossed', 4),
('Retail & Shopping', 'Background music for stores and boutiques', 'ShoppingBag', 5),
('Hotel & Lobby', 'Elegant sounds for hospitality spaces', 'Building2', 6);