-- Fix overly permissive RLS policies for INSERT operations
-- Service role bypasses RLS anyway, so these policies just create security holes

-- Drop the permissive INSERT policies
DROP POLICY IF EXISTS "Service role can insert daily orb stocks" ON public.daily_orb_stocks;
DROP POLICY IF EXISTS "Service role can insert trade logs" ON public.trade_logs;

-- Note: Service role will still be able to insert (it bypasses RLS)
-- We don't need explicit policies for service role operations