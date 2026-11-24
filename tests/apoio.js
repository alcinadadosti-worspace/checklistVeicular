// Apoio para os testes: um Firestore de mentira, em memória, que entende as duas chamadas
// REST que o app usa (documents:commit e documents:runQuery) e a exclusão de documento.

import { decodificarCampos } from '../src/lib/nuvem.js';

export function criarFirestoreFalso({ projeto = 'projeto-teste', colecao = 'checklists' } = {}) {
  const documentos = new Map(); // id -> { fields, servidorEm (ms) }
  const prefixo = `projects/${projeto}/databases/(default)/documents`;
  let relogio = Date.parse('2026-11-24T12:00:00.000Z');
  const estado = { offline: false, recusar: null, chamadas: [], leituras: 0 };

  const resposta = (status, corpo) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo
  });

  const requisitar = async (url, { method = 'GET', body } = {}) => {
    estado.chamadas.push({ url, method, body: body ? JSON.parse(body) : null });
    if (estado.offline) throw new TypeError('Failed to fetch');
    const caminho = decodeURIComponent(new URL(url).pathname);
    const dados = body ? JSON.parse(body) : null;

    if (method === 'POST' && caminho.endsWith(`${prefixo}:commit`)) {
      for (const escrita of dados.writes) {
        const id = escrita.update.name.split('/').pop();
        if (!escrita.update.name.startsWith(`${prefixo}/${colecao}/`))
          return resposta(403, { error: { message: 'coleção não permitida' } });
        const registro = decodificarCampos(escrita.update.fields);
        if (estado.recusar?.(registro))
          return resposta(403, { error: { message: 'Missing or insufficient permissions.' } });
        relogio += 1000;
        const fields = { ...escrita.update.fields };
        for (const transformacao of escrita.updateTransforms || []) {
          if (transformacao.setToServerValue === 'REQUEST_TIME') {
            fields[transformacao.fieldPath] = { timestampValue: new Date(relogio).toISOString() };
          }
        }
        documentos.set(id, { fields, servidorEm: relogio });
      }
      return resposta(200, { commitTime: new Date(relogio).toISOString() });
    }

    if (method === 'POST' && caminho.endsWith(`${prefixo}:runQuery`)) {
      const consulta = dados.structuredQuery;
      const filtro = consulta.where?.fieldFilter;
      const desde = filtro ? Date.parse(filtro.value.timestampValue) : -Infinity;
      const linhas = [...documentos.entries()]
        .filter(([, documento]) => documento.servidorEm > desde)
        .sort((a, b) => a[1].servidorEm - b[1].servidorEm)
        .slice(0, consulta.limit ?? 1000)
        .map(([id, documento]) => ({
          document: { name: `${prefixo}/${colecao}/${id}`, fields: documento.fields },
          readTime: new Date(relogio).toISOString()
        }));
      estado.leituras += Math.max(1, linhas.length);
      return resposta(200, linhas.length > 0 ? linhas : [{ readTime: new Date(relogio).toISOString() }]);
    }

    if (method === 'DELETE' && caminho.startsWith(`${prefixo}/${colecao}/`)) {
      documentos.delete(caminho.split('/').pop());
      return resposta(200, {});
    }

    return resposta(404, { error: { message: `rota desconhecida: ${method} ${caminho}` } });
  };

  return {
    requisitar,
    estado,
    documentos,
    avancarRelogio: ms => {
      relogio += ms;
    },
    registro: id => (documentos.has(id) ? decodificarCampos(documentos.get(id).fields) : null)
  };
}

export const UNIDADE_TESTE = {
  id: 'penedo',
  nome: 'Penedo',
  sigla: 'PND',
  motoristaPadrao: 'rogerio',
  veiculo: { nome: 'Toyota Hilux', versao: 'Cabine Simples', apelido: 'Hilux CS', modelo: '/models/hilux.glb' }
};

export const ITENS_OK = {
  farois: 'bom',
  estepe: 'bom',
  limpador: 'bom',
  pneusDianteiros: 'bom',
  pneusTraseiros: 'bom',
  calotas: 'bom',
  oleo: 'bom'
};
