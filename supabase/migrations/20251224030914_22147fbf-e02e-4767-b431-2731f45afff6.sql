-- Fix decrypt_secret to properly use the legacy default key
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
  
  -- Try configured key first, fall back to legacy default
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
    RETURN NULL;
END;
$function$;