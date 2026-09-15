CREATE TYPE account_plan AS ENUM ('free', 'paid');

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    country_code TEXT REFERENCES countries (code),
    state_code TEXT REFERENCES states (code),
    plan account_plan NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
