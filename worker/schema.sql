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

-- Compteurs globaux affichés sur le site (boosters ouverts, albums complétés).
CREATE TABLE IF NOT EXISTS totals (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Albums complétés, dans l'ordre d'arrivée. Le rang est le numéro d'ordre :
-- c'est lui qu'on annonce au joueur. On garde le nombre de boosters qu'il lui
-- aura fallu, et rien d'autre — ni identité, ni empreinte.
CREATE TABLE IF NOT EXISTS completions (
  rank  INTEGER PRIMARY KEY,
  packs INTEGER NOT NULL,
  at    INTEGER NOT NULL
);
