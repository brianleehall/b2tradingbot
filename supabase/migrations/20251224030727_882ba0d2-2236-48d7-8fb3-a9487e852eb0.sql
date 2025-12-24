-- Fix weak encryption key vulnerability
-- Update encrypt_secret to fail if no proper key is configured
CREATE OR REPLACE FUNCTION public.encrypt_secret(plain_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key TEXT;
  encrypted_bytes bytea;
BEGIN
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- SECURITY: Fail if no encryption key is configured (no default fallback)
  IF encryption_key IS NULL OR encryption_key = '' OR encryption_key = 'default_encryption_key_replace_in_production' THEN
    RAISE EXCEPTION 'Encryption key not configured. Set app.settings.encryption_key in Supabase Vault.';
  END IF;
  
  encrypted_bytes := extensions.pgp_sym_encrypt(plain_text, encryption_key);
  
  -- Encode and remove newlines for clean storage
  RETURN replace(encode(encrypted_bytes, 'base64'), E'\n', '');
END;
$function$;

-- Update decrypt_secret to fail if no proper key is configured
CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key TEXT;
  clean_text TEXT;
BEGIN
  IF encrypted_text IS NULL OR encrypted_text = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove any newlines from the base64 text
  clean_text := replace(encrypted_text, E'\n', '');
  clean_text := replace(clean_text, E'\r', '');
  
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- SECURITY: Fail if no encryption key is configured (no default fallback)
  IF encryption_key IS NULL OR encryption_key = '' OR encryption_key = 'default_encryption_key_replace_in_production' THEN
    RAISE EXCEPTION 'Encryption key not configured. Set app.settings.encryption_key in Supabase Vault.';
  END IF;
  
  RETURN extensions.pgp_sym_decrypt(
    decode(clean_text, 'base64'),
    encryption_key
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging
    RAISE WARNING 'Decryption failed: %', SQLERRM;
    RETURN NULL;
END;
$function$;