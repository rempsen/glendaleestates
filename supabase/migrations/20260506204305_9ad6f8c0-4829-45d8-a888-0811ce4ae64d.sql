ALTER TABLE public.submission_payments ADD COLUMN IF NOT EXISTS balance_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE public.submission_payments ADD COLUMN IF NOT EXISTS balance_paid_date date;