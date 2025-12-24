-- Fix: Allow decryption with legacy default key for backwards compatibility
-- New encryption still requires proper key, but existing data can still be read
CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key TEXT;
  clean_text TEXT;
  default_key TEXT := 'default_encryption_key_replace_in_production';
BEGIN
  IF encrypted_text IS NULL OR encrypted_text = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove any newlines from the base64 text
  clean_text := replace(encrypted_text, E'\n', '');
  clean_text := replace(clean_text, E'\r', '');
  
  -- Try configured key first
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- If no key configured or it's empty, use the legacy default for backwards compatibility
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := default_key;
  END IF;
  
  -- Try decryption with the primary key
  BEGIN
    RETURN extensions.pgp_sym_decrypt(
      decode(clean_text, 'base64'),
      encryption_key
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- If primary key fails and we have a configured key, try the default key
      -- (data may have been encrypted before key was configured)
      IF encryption_key != default_key THEN
        BEGIN
          RETURN extensions.pgp_sym_decrypt(
            decode(clean_text, 'base64'),
            default_key
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Decryption failed with both keys: %', SQLERRM;
            RETURN NULL;
        END;
      ELSE
        RAISE WARNING 'Decryption failed: %', SQLERRM;
        RETURN NULL;
      END IF;
  END;
END;
$function$;