-- Defense in depth for the name length rule enforced in
-- internal/account/service.go (validateNameFormat): max 100 characters.
--
-- The character-set rule (letters incl. accented characters and ñ, spaces,
-- hyphens, apostrophes) is intentionally NOT duplicated here as a regex
-- CHECK constraint. An earlier version of this migration did, but Postgres
-- POSIX regexes have no equivalent to Go/JS's \p{L} (full Unicode "letter"
-- category), so the DB's character class inevitably drifted narrower than
-- the application-layer checks (Go's namePattern and the frontend's
-- NAME_PATTERN) and rejected valid non-Latin names the app had already
-- accepted, as a confusing 500. Character-set validation is owned solely by
-- the application layer (service.go + types.ts), which both already agree
-- on \p{L}; the database only enforces the one invariant that's unambiguous
-- across engines: length.
ALTER TABLE accounts
    ADD CONSTRAINT accounts_first_name_length CHECK (char_length(first_name) BETWEEN 1 AND 100),
    ADD CONSTRAINT accounts_last_name_length CHECK (char_length(last_name) BETWEEN 1 AND 100);

ALTER TABLE children
    ADD CONSTRAINT children_first_name_length CHECK (char_length(first_name) BETWEEN 1 AND 100),
    ADD CONSTRAINT children_last_name_length CHECK (char_length(last_name) BETWEEN 1 AND 100);
