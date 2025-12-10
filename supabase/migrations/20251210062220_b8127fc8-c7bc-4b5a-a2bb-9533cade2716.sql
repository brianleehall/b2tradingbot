-- Fix the trigger to properly detect already-encrypted data
-- The encrypt_secret function produces base64 that starts with 'ww0E' not 'wcDM'
CREATE OR REPLACE FUNCTION public.encrypt_trading_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only encrypt if the value doesn't look like it's already encrypted
  -- Base64 encoded PGP data from our encrypt_secret function starts with 'ww0E'
  IF NEW.api_key_id IS NOT NULL AND LEFT(NEW.api_key_id, 4) NOT IN ('ww0E', 'wcDM') THEN
    NEW.api_key_id := encrypt_secret(NEW.api_key_id);
  END IF;
  
  IF NEW.secret_key IS NOT NULL AND LEFT(NEW.secret_key, 4) NOT IN ('ww0E', 'wcDM') THEN
    NEW.secret_key := encrypt_secret(NEW.secret_key);
  END IF;
  
  RETURN NEW;
END;
$function$;