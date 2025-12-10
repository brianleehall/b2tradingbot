-- Fix the decrypt function to handle the decryption properly
-- First test if we can decrypt with the correct approach
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
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'default_encryption_key_replace_in_production';
  END IF;
  
  RETURN extensions.pgp_sym_decrypt(
    decode(clean_text, 'base64'),
    encryption_key
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging
    RAISE WARNING 'Decryption failed: %', SQLERRM;
    -- Return NULL instead of encrypted text to avoid header issues
    RETURN NULL;
END;
$function$;

-- Also fix the encrypt function to not produce newlines
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
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'default_encryption_key_replace_in_production';
  END IF;
  
  encrypted_bytes := extensions.pgp_sym_encrypt(plain_text, encryption_key);
  
  -- Encode and remove newlines for clean storage
  RETURN replace(encode(encrypted_bytes, 'base64'), E'\n', '');
END;
$function$;