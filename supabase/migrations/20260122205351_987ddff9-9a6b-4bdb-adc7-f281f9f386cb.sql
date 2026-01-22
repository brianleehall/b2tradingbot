-- Add missing RLS policies for trade_logs table (INSERT for authenticated users)
CREATE POLICY "Users can insert their own trade logs"
ON public.trade_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add DELETE policy for user_orb_tickers (users can only delete their own)
CREATE POLICY "Users can delete their own orb tickers"
ON public.user_orb_tickers
FOR DELETE
USING (auth.uid() = user_id);

-- Add DELETE policy for profiles (users can only delete their own profile)
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
USING (auth.uid() = id);