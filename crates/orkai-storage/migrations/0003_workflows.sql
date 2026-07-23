-- Workflows: cada workspace passa a ser um "workflow" ligado a uma pasta de projeto.
-- O usuario pode ter varios, cada um mexendo num repositorio diferente.
-- A linha unica que ja existia vira o primeiro workflow, com root vazio (cai no
-- diretorio padrao do app).
ALTER TABLE workspace ADD COLUMN root_path TEXT NOT NULL DEFAULT '';

-- Preferencias do app que precisam sobreviver ao restart (ex.: qual workflow estava ativo).
-- Tema fica no front (localStorage); aqui vai so o que o backend precisa saber.
CREATE TABLE app_setting (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
