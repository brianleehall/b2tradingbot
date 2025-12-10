-- Drop and recreate the encrypt_secret function to properly reference extensions schema
CREATE OR REPLACE FUNCTION public.encrypt_secret(plain_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key TEXT;
BEGIN
  -- Get the encryption key from vault or use a derived key
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'default_encryption_key_replace_in_production';
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt(plain_text, encryption_key),
    'base64'
  );
END;
$function$;

-- Drop and recreate the decrypt_secret function to properly reference extensions schema
CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
  
  RETURN extensions.pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    encryption_key
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If decryption fails (e.g., data was not encrypted), return as-is
    RETURN encrypted_text;
END;
$function$;