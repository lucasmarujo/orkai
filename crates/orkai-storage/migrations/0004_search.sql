-- Indice de busca do M6.
--
-- FTS5 em vez de tantivy: o SQLite ja esta aqui e o corpus e local e pequeno
-- (arquivos de texto de um workflow). Uma dependencia nova de indice seria um
-- segundo estado para manter em sincronia com este banco.
--
-- `path` e indexado de proposito: buscar pelo nome do arquivo e tao comum quanto
-- buscar pelo conteudo. `remove_diacritics 2` faz "sessao" achar "sessão" — sem
-- isso a busca e inutil num app em portugues.
CREATE VIRTUAL TABLE search USING fts5 (
    path,
    body,
    workspace_id UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);
