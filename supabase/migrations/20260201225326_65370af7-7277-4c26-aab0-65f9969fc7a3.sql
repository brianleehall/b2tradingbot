-- Create trading_state table for backend auto-reset of daily loss lock
CREATE TABLE IF NOT EXISTS public.trading_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  lock_reason TEXT,
  lock_date DATE,
  manual_stop BOOLEAN NOT NULL DEFAULT FALSE,
  trades_today INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.trading_state ENABLE ROW LEVEL SECURITY;

-- Users can view their own trading state
CREATE POLICY "Users can view their own trading state"
ON public.trading_state
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own trading state
CREATE POLICY "Users can insert their own trading state"
ON public.trading_state
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own trading state
CREATE POLICY "Users can update their own trading state"
ON public.trading_state
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own trading state
CREATE POLICY "Users can delete their own trading state"
ON public.trading_state
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_trading_state_updated_at
BEFORE UPDATE ON public.trading_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for efficient queries
CREATE INDEX idx_trading_state_locked ON public.trading_state (is_locked, lock_date);

COMMENT ON TABLE public.trading_state IS 'Tracks trading state for auto-reset of daily loss locks';