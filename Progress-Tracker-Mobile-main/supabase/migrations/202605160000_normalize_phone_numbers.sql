-- Phase 5 - Data Migration and Phase 4 - Database Constraint

-- 1. Create temporary normalization function
create or replace function pg_temp.normalize_phone(p_phone text) returns text as $$
declare
  v_digits text;
begin
  if p_phone is null then
    return null;
  end if;

  -- Remove non-digits
  v_digits := regexp_replace(p_phone, '\D', '', 'g');

  if v_digits = '' then
    return null;
  end if;

  -- Remove leading zeros
  v_digits := regexp_replace(v_digits, '^0+', '');

  -- Strip leading 91s until 10 digits
  while length(v_digits) > 10 and starts_with(v_digits, '91') loop
    v_digits := substring(v_digits from 3);
  end loop;

  if length(v_digits) = 10 then
    return '91' || v_digits;
  end if;

  -- Return null for invalid length numbers
  return null;
end;
$$ language plpgsql;

-- 2. Safely drop old check constraint for phone number
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- We loop to handle potential multiple constraints or just drop the one we find
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.users'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) ILIKE '%phone_number%'
    LOOP
        EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(constraint_name);
    END LOOP;
END $$;

-- 3. Normalize existing phone numbers
update public.users
set phone_number = pg_temp.normalize_phone(phone_number)
where phone_number is not null;

-- 4. Add the new strict constraint
alter table public.users add constraint users_phone_number_check 
  check (phone_number is null or phone_number ~ '^91[0-9]{10}$');
