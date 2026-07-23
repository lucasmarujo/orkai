-- Transcript persistido de um no com processo (agente ou terminal).
-- Uma linha por no: o scrollback ja e um buffer circular limitado (256 KB), entao
-- guardar o snapshot inteiro e sobrescrever e mais simples que uma tabela append-only.
CREATE TABLE node_output (
    node_id    TEXT PRIMARY KEY NOT NULL REFERENCES node (id) ON DELETE CASCADE,
    data       BLOB NOT NULL,
    updated_at INTEGER NOT NULL
);
