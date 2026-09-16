-- Defense in depth for the name format/length rules enforced in
-- internal/account/service.go (validateNameFormat): letters (incl. accented
-- characters and ñ), spaces, hyphens and apostrophes only, max 100
-- characters. Uses explicit Unicode ranges rather than POSIX [[:alpha:]],
-- which depends on the database locale/collation and cannot be trusted to
-- match accented letters consistently.
ALTER TABLE accounts
    ADD CONSTRAINT accounts_first_name_format CHECK (first_name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ''\- ]+$' AND char_length(first_name) <= 100),
    ADD CONSTRAINT accounts_last_name_format CHECK (last_name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ''\- ]+$' AND char_length(last_name) <= 100);

ALTER TABLE children
    ADD CONSTRAINT children_first_name_format CHECK (first_name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ''\- ]+$' AND char_length(first_name) <= 100),
    ADD CONSTRAINT children_last_name_format CHECK (last_name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ''\- ]+$' AND char_length(last_name) <= 100);
