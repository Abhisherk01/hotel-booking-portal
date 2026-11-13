-- Hotel photography (amendment 9): the URL is owned by the database but
-- deliberately nullable - an absent URL means the client renders its own
-- fallback asset, so the backend never blocks on photography. Seeded
-- properties stay NULL for now; real image URLs land with the frontend
-- phase, where they can also be served from local frontend assets.
ALTER TABLE hotels ADD COLUMN image_url VARCHAR(500) NULL;
