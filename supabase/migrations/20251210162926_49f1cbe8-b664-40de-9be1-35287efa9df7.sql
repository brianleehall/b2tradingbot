-- Create table to store daily ORB stock selections
CREATE TABLE public.daily_orb_stocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  price_change NUMERIC NOT NULL,
  rvol NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  avg_volume NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  float_millions NUMERIC,
  exchange TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(scan_date, symbol)
);

-- Enable RLS
ALTER TABLE public.daily_orb_stocks ENABLE ROW LEVEL SECURITY;

-- Anyone can read daily stocks (public data)
CREATE POLICY "Anyone can view daily orb stocks" 
ON public.daily_orb_stocks 
FOR SELECT 
USING (true);

-- Only service role can insert (from edge function)
CREATE POLICY "Service role can insert daily orb stocks" 
ON public.daily_orb_stocks 
FOR INSERT 
WITH CHECK (true);

-- Create index for fast date lookups
CREATE INDEX idx_daily_orb_stocks_date ON public.daily_orb_stocks(scan_date DESC);