// Teste de integração CONTRA O BANCO REAL (produção), usando o código do próprio app — sem navegador.
// Confere gravação, leitura, consulta incremental, regras de segurança (o que deve ser recusado) e
// exclusão.
//
// SEGURANÇA: só cria registros com motorista "TESTE AUTOMATICO" e apaga todos no final (mesmo se
// falhar). A verificação "banco voltou ao estado inicial" pode acusar falso erro se alguém usar o
// app durante os ~10 s do teste.
//
//   node tests/integracao/firestore-real.mjs [id-do-projeto]
// (sem argumento, usa o projeto de src/config/firebase.js)

import { FIREBASE_PROJECT_ID } from '../../src/config/firebase.js';
import { unidadePorId } from '../../src/config/frota.js';
import { criarNuvem } from '../../src/lib/nuvem.js';
import { criarRegistro, registrarRetorno } from '../../src/lib/registros.js';

const projeto = process.argv[2] || FIREBASE_PROJECT_ID;
if (!projeto) {
  console.log('Sem ID do projeto Firebase (src/config/firebase.js).');
  process.exit(1);
}
const nuvem = criarNuvem({ projeto });
const base = `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents`;
const NOME = 'TESTE AUTOMATICO';
const itens = {
  farois: 'bom',
  estepe: 'ruim',
  limpador: 'bom',
  pneusDianteiros: 'bom',
  pneusTraseiros: 'bom',
  calotas: 'bom',
  oleo: 'faltante'
};
const criados = [];
let falhas = 0;

const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};
const esperarRecusa = async (descricao, acao, tipoEsperado = 'permissao') => {
  try {
    await acao();
    conferir(descricao, false, 'a nuvem ACEITOU (deveria recusar)');
  } catch (erro) {
    conferir(descricao, erro.tipo === tipoEsperado, `recusado como "${erro.tipo}" (HTTP ${erro.status})`);
  }
};
const recusado = resposta => {
  if (!resposta.ok)
    throw Object.assign(new Error('recusado'), {
      tipo: resposta.status === 403 ? 'permissao' : 'outro',
      status: resposta.status
    });
};
const novo = extra => {
  const registro = criarRegistro({
    unidade: unidadePorId('penedo'),
    motoristaId: 'outro',
    motoristaNome: NOME,
    kmSaida: 100,
    itens,
    outros: 'registro de teste — pode apagar',
    ...extra
  });
  criados.push(registro.id);
  return registro;
};

try {
  console.log(`Projeto: ${projeto}\n`);

  console.log('1) Leitura inicial');
  const inicio = await nuvem.buscar(null);
  conferir('buscar tudo responde', Array.isArray(inicio.registros), `${inicio.registros.length} registro(s) no banco`);

  console.log('\n2) Gravar um checklist de saída');
  const saida = novo();
  const carimbo = await nuvem.enviar(saida);
  conferir('enviar aceito pelo servidor', typeof carimbo === 'string', `commitTime ${carimbo}`);
  const depois = await nuvem.buscar(null);
  const lido = depois.registros.find(r => r.id === saida.id);
  conferir('registro aparece na leitura', Boolean(lido));
  conferir('servidor carimbou "servidorEm"', typeof lido?.servidorEm === 'string', lido?.servidorEm);
  conferir('cursor é a hora do servidor', Number.isFinite(depois.cursor));
  const { servidorEm, ...semCarimbo } = lido || {};
  const ordenado = objeto => JSON.stringify(objeto, Object.keys(objeto).sort());
  conferir(
    'todos os campos voltam idênticos',
    ordenado(semCarimbo) === ordenado(saida),
    servidorEm ? '' : 'sem carimbo'
  );
  conferir(
    'tipos preservados (inteiro, nulo, booleano, mapa)',
    lido?.kmSaida === 100 && lido?.kmVolta === null && lido?.excluido === false && lido?.itens?.oleo === 'faltante'
  );

  console.log('\n3) Consulta incremental (só o que mudou depois do cursor)');
  const semNovidade = await nuvem.buscar(depois.cursor);
  conferir(
    'sem novidades: volta só a margem de segurança',
    semNovidade.registros.every(r => Date.parse(r.servidorEm) > depois.cursor - 61000),
    `${semNovidade.registros.length} doc(s) relidos`
  );
  conferir('cursor não anda para trás', semNovidade.cursor === depois.cursor);
  await new Promise(resolver => setTimeout(resolver, 1500));
  const retorno = { ...registrarRetorno(saida, 182), atualizadoEm: Date.now() };
  await nuvem.enviar(retorno);
  const incremento = await nuvem.buscar(depois.cursor);
  const atualizado = incremento.registros.find(r => r.id === saida.id);
  conferir(
    'atualização (KM de volta) chega na consulta incremental',
    atualizado?.kmVolta === 182 && typeof atualizado?.retornoEm === 'string'
  );
  conferir('cursor avançou', incremento.cursor > depois.cursor);

  console.log('\n4) Regras: o que deve ser recusado');
  await esperarRecusa('KM de volta menor que o de saída', () => nuvem.enviar({ ...novo(), kmVolta: 50 }));
  await esperarRecusa('motorista em branco', () => nuvem.enviar({ ...novo(), motoristaNome: '' }));
  await esperarRecusa('KM de saída negativo', () => nuvem.enviar({ ...novo(), kmSaida: -5 }));
  await esperarRecusa('KM de saída que não é número inteiro', () => nuvem.enviar({ ...novo(), kmSaida: 10.5 }));
  await esperarRecusa('id diferente do documento', async () => {
    const r = novo();
    const resposta = await fetch(`${base}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: `projects/${projeto}/databases/(default)/documents/checklists/${r.id}x`,
              fields: { id: { stringValue: r.id } }
            }
          }
        ]
      })
    });
    if (resposta.ok) criados.push(`${r.id}x`);
    recusado(resposta);
  });
  await esperarRecusa('gravar em outra coleção', async () => {
    recusado(
      await fetch(`${base}/outra_colecao?documentId=teste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { x: { stringValue: 'y' } } })
      })
    );
  });
  await esperarRecusa('ler outra coleção', async () => recusado(await fetch(`${base}/outra_colecao?pageSize=1`)));
  await esperarRecusa('apagar registro que não está marcado como excluído', () => nuvem.apagar(saida.id));

  console.log('\n5) Exclusão (como a administração faz) e limpeza');
  await nuvem.enviar({ ...retorno, excluido: true, atualizadoEm: Date.now() });
  const aposExcluir = await nuvem.buscar(incremento.cursor);
  conferir(
    'marca de exclusão chega aos outros aparelhos',
    aposExcluir.registros.find(r => r.id === saida.id)?.excluido === true
  );
  await nuvem.apagar(saida.id);
  const final = await nuvem.buscar(null);
  conferir('registro de teste apagado de vez', !final.registros.some(r => r.id === saida.id));
  conferir(
    'banco voltou ao estado inicial',
    final.registros.length === inicio.registros.length,
    `${final.registros.length} registro(s)`
  );
} catch (erro) {
  falhas += 1;
  console.log(`\n ERRO inesperado: [${erro.tipo || erro.name}] ${erro.message}`);
} finally {
  // garante que nada de teste fica para trás
  const sobras = (await nuvem.buscar(null).catch(() => ({ registros: [] }))).registros.filter(
    r => r.motoristaNome === NOME || criados.includes(r.id)
  );
  for (const sobra of sobras) {
    try {
      const limpo = { ...sobra };
      delete limpo.servidorEm; // campo só da nuvem
      if (!sobra.excluido) await nuvem.enviar({ ...limpo, excluido: true, atualizadoEm: Date.now() });
      await nuvem.apagar(sobra.id);
      console.log(`  (limpeza: removido ${sobra.id})`);
    } catch (erro) {
      falhas += 1;
      console.log(`  (limpeza: NÃO consegui remover ${sobra.id}: ${erro.message})`);
    }
  }
}

console.log(
  falhas === 0 ? '\nTUDO CERTO: o app conversa com o Firestore de verdade.' : `\n${falhas} verificação(ões) falharam.`
);
process.exit(falhas === 0 ? 0 : 1);
