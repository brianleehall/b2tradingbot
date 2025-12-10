-- Create table to store user's selected ORB tickers
CREATE TABLE public.user_orb_tickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbols TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_orb_tickers ENABLE ROW LEVEL SECURITY;

-- Users can view their own tickers
CREATE POLICY "Users can view their own tickers"
ON public.user_orb_tickers
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own tickers
CREATE POLICY "Users can insert their own tickers"
ON public.user_orb_tickers
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own tickers
CREATE POLICY "Users can update their own tickers"
ON public.user_orb_tickers
FOR UPDATE
USING (auth.uid() = user_id);

-- Create unique constraint on user_id (one row per user)
CREATE UNIQUE INDEX user_orb_tickers_user_id_idx ON public.user_orb_tickers(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_orb_tickers_updated_at
BEFORE UPDATE ON public.user_orb_tickers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get user's selected tickers (for edge function use)
CREATE OR REPLACE FUNCTION public.get_user_orb_tickers(p_user_id uuid)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result TEXT[];
BEGIN
  SELECT symbols INTO result
  FROM user_orb_tickers
  WHERE user_id = p_user_id;
  
  RETURN COALESCE(result, ARRAY[]::TEXT[]);
END;
$$;