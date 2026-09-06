-- Compteur de tirages par carte. Une ligne par Kard, créée à la volée.
CREATE TABLE IF NOT EXISTS card_pulls (
  card_id TEXT PRIMARY KEY,
  pulls   INTEGER NOT NULL DEFAULT 0
);

-- Budget anti-abus, par IP hachée et par heure. L'empreinte est salée : elle
-- sert de clé de comptage et ne permet pas de retrouver l'adresse.
CREATE TABLE IF NOT EXISTS ip_budget (
  ip_hash TEXT PRIMARY KEY,
  hour    INTEGER NOT NULL,
  pulls   INTEGER NOT NULL DEFAULT 0
);
