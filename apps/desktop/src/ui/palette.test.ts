import { describe, expect, it } from 'vitest';

import { filtrar, normalizar, type Resultado, type ResultadoTipo } from './palette';

const item = (titulo: string, tipo: ResultadoTipo = 'no'): Resultado => ({
  tipo,
  id: titulo,
  titulo,
  detalhe: '',
  executar: () => undefined,
});

const titulos = (fontes: Resultado[], termo: string) => filtrar(fontes, termo).map((r) => r.titulo);

describe('filtrar', () => {
  it('põe prefixo do título acima de palavra interna, e essa acima de substring', () => {
    const fontes = [item('interpretar'), item('novo terminal'), item('terminal padrão')];
    expect(titulos(fontes, 'ter')).toEqual(['terminal padrão', 'novo terminal', 'interpretar']);
  });

  it('acha título com acento buscando sem acento, e o contrário', () => {
    // O tokenizer do FTS5 normaliza acento; se este lado não normalizasse, a mesma
    // busca acharia dentro do arquivo e não acharia o nó com o mesmo nome.
    expect(titulos([item('Sessão de revisão')], 'sessao')).toEqual(['Sessão de revisão']);
    expect(titulos([item('Sessao de revisao')], 'sessão')).toEqual(['Sessao de revisao']);
  });

  it('quebra o título em palavras por separador de caminho e de código', () => {
    const fontes = [item('src/nodes/GitNode.tsx'), item('use-attention.ts')];
    expect(titulos(fontes, 'git')).toEqual(['src/nodes/GitNode.tsx']);
    expect(titulos(fontes, 'attention')).toEqual(['use-attention.ts']);
  });

  it('desempata pelo tipo quando o texto casa igual', () => {
    const fontes = [item('git', 'prompt'), item('git', 'arquivo'), item('git', 'acao')];
    expect(filtrar(fontes, 'git').map((r) => r.tipo)).toEqual(['acao', 'prompt', 'arquivo']);
  });

  it('devolve tudo na ordem original quando o termo é vazio', () => {
    const fontes = [item('b'), item('a')];
    expect(titulos(fontes, '   ')).toEqual(['b', 'a']);
  });

  it('devolve vazio quando nada casa', () => {
    expect(filtrar([item('terminal')], 'zzz')).toEqual([]);
  });
});

describe('normalizar', () => {
  it('tira acento e caixa', () => {
    expect(normalizar('Ação Ímã')).toBe('acao ima');
  });
});
