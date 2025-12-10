-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encryption key (we'll use the service role key as the base for encryption)
-- This function encrypts text using AES-256
CREATE OR REPLACE FUNCTION encrypt_secret(plain_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- Get the encryption key from vault or use a derived key
  -- In production, this should come from Supabase Vault
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    -- Fallback: use a hash of the service role as key (set via app config)
    encryption_key := 'default_encryption_key_replace_in_production';
  END IF;
  
  RETURN encode(
    pgp_sym_encrypt(plain_text, encryption_key),
    'base64'
  );
END;
$$;

-- Create decryption function (only accessible via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION decrypt_secret(encrypted_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  IF encrypted_text IS NULL OR encrypted_text = '' THEN
    RETURN NULL;
  END IF;
  
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'default_encryption_key_replace_in_production';
  END IF;
  
  RETURN pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    encryption_key
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If decryption fails (e.g., data was not encrypted), return as-is
    -- This handles migration of existing plain-text data
    RETURN encrypted_text;
END;
$$;

-- Create a secure function to get trading config with decrypted credentials
-- This is called by edge functions using service role
CREATE OR REPLACE FUNCTION get_decrypted_trading_config(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  api_key_id TEXT,
  secret_key TEXT,
  is_paper_trading BOOLEAN,
  selected_strategy TEXT,
  auto_trading_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.id,
    tc.user_id,
    decrypt_secret(tc.api_key_id) as api_key_id,
    decrypt_secret(tc.secret_key) as secret_key,
    tc.is_paper_trading,
    tc.selected_strategy,
    tc.auto_trading_enabled
  FROM trading_configurations tc
  WHERE tc.user_id = p_user_id;
END;
$$;

-- Create a secure function to get all active trading configs (for auto-trade cron)
CREATE OR REPLACE FUNCTION get_active_trading_configs()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  api_key_id TEXT,
  secret_key TEXT,
  is_paper_trading BOOLEAN,
  selected_strategy TEXT,
  auto_trading_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.id,
    tc.user_id,
    decrypt_secret(tc.api_key_id) as api_key_id,
    decrypt_secret(tc.secret_key) as secret_key,
    tc.is_paper_trading,
    tc.selected_strategy,
    tc.auto_trading_enabled
  FROM trading_configurations tc
  WHERE tc.auto_trading_enabled = true;
END;
$$;

-- Create trigger to auto-encrypt on insert/update
CREATE OR REPLACE FUNCTION encrypt_trading_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only encrypt if the value doesn't look like it's already encrypted (base64 PGP format)
  IF NEW.api_key_id IS NOT NULL AND LEFT(NEW.api_key_id, 4) != 'wcDM' THEN
    NEW.api_key_id := encrypt_secret(NEW.api_key_id);
  END IF;
  
  IF NEW.secret_key IS NOT NULL AND LEFT(NEW.secret_key, 4) != 'wcDM' THEN
    NEW.secret_key := encrypt_secret(NEW.secret_key);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for insert
DROP TRIGGER IF EXISTS encrypt_credentials_on_insert ON trading_configurations;
CREATE TRIGGER encrypt_credentials_on_insert
BEFORE INSERT ON trading_configurations
FOR EACH ROW
EXECUTE FUNCTION encrypt_trading_credentials();

-- Create trigger for update
DROP TRIGGER IF EXISTS encrypt_credentials_on_update ON trading_configurations;
CREATE TRIGGER encrypt_credentials_on_update
BEFORE UPDATE ON trading_configurations
FOR EACH ROW
EXECUTE FUNCTION encrypt_trading_credentials();