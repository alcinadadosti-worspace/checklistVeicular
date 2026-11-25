// Testes da camada de dados (rodam com `npm test`, sem navegador).

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';

import { MOTORISTAS, UNIDADES, motoristasDaUnidade, unidadePorId } from '../src/config/frota.js';
import { identificar, lembrarMotorista, motoristaDaUnidade } from '../src/lib/acesso.js';
import { banco, gravarPreferencia } from '../src/lib/banco.js';
import { gerarCsv } from '../src/lib/exportar.js';
import { paraKm } from '../src/lib/formato.js';
import { hashDoCodigo, sha256 } from '../src/lib/hash.js';
import { codificarCampos, criarNuvem, decodificarCampos } from '../src/lib/nuvem.js';
import { apagarRascunho, gravarRascunho, lerRascunho, novoRascunho } from '../src/lib/rascunho.js';
import {
  criarRegistro,
  emRota,
  kmRodados,
  registrarRetorno,
  resumoDosItens,
  ultimoKm,
  validarChecklist,
  validarRetorno
} from '../src/lib/registros.js';
import { criarSincronizacao } from '../src/lib/sincronizacao.js';
import { ITENS_OK, UNIDADE_TESTE, criarFirestoreFalso } from './apoio.js';

const novoRegistro = (extra = {}, quando = new Date('2026-11-24T08:00:00-03:00')) =>
  criarRegistro(
    {
      unidade: UNIDADE_TESTE,
      motoristaId: 'rogerio',
      motoristaNome: 'Rogerio',
      kmSaida: 45210,
      itens: ITENS_OK,
      ...extra
    },
    quando
  );

describe('códigos de acesso', () => {
  it('sha256 confere com a implementação do Node', () => {
    for (const texto of ['', 'abc', '0123456789', 'ç'.repeat(70), 'x'.repeat(1000)]) {
      assert.equal(sha256(texto), createHash('sha256').update(texto, 'utf8').digest('hex'));
    }
  });

  // Os códigos de verdade não ficam escritos no repositório. Para conferi-los, rode:
  //   CODIGOS_TESTE="penedo=00000,palmeira=00000,admin=000000" npm test
  const informados = Object.fromEntries(
    (process.env.CODIGOS_TESTE || '')
      .split(',')
      .map(par => par.trim().split('='))
      .filter(par => par.length === 2)
  );

  it('reconhece os códigos configurados', { skip: Object.keys(informados).length === 0 }, () => {
    for (const [quem, codigo] of Object.entries(informados)) {
      const esperado = quem === 'admin' ? { tipo: 'admin' } : { tipo: 'unidade', unidadeId: quem };
      assert.deepEqual(identificar(codigo), esperado, `código de ${quem}`);
    }
  });

  it('recusa códigos errados, incompletos ou vazios', () => {
    for (const codigo of ['', '0', '123', '0000', '00000', '12345', '999999', ' 12 34 ', 'abcde', null, undefined]) {
      assert.equal(identificar(codigo), null, `código ${codigo}`);
    }
    assert.notEqual(hashDoCodigo('00000'), hashDoCodigo('00001'));
    assert.equal(hashDoCodigo(' 00000 '), hashDoCodigo('00000'), 'espaços em volta são ignorados');
  });
});

describe('motoristas', () => {
  const penedo = unidadePorId('penedo');
  const palmeira = unidadePorId('palmeira');
  beforeEach(() => {
    for (const unidade of UNIDADES) {
      gravarPreferencia(`motorista.${unidade.id}`, null);
      apagarRascunho(unidade);
    }
  });

  it('cada unidade mostra os motoristas dela e "Outro"', () => {
    const ids = unidade => motoristasDaUnidade(unidade).map(motorista => motorista.id);
    assert.deepEqual(ids(penedo), ['rogerio', 'marcio', 'outro']);
    assert.deepEqual(ids(palmeira), ['caique', 'pedro', 'outro']);
    for (const unidade of UNIDADES) {
      assert.ok(ids(unidade).includes(unidade.motoristaPadrao), `padrão de ${unidade.nome} está nas opções`);
    }
  });

  it('todo motorista com foto tem o arquivo e o enquadramento do crachá', () => {
    for (const motorista of MOTORISTAS.filter(item => item.foto)) {
      assert.ok(existsSync(new URL(`../src/assets/fotos/${motorista.foto}.webp`, import.meta.url)), motorista.foto);
      assert.ok(
        motorista.foco.every(valor => valor >= 0 && valor <= 1),
        `foco de ${motorista.nome}`
      );
      assert.ok(motorista.zoom >= 1, `zoom de ${motorista.nome}`);
    }
  });

  it('lembra o último motorista da unidade, mas só se ele for opção dela', () => {
    assert.equal(motoristaDaUnidade(penedo).id, 'rogerio', 'sem escolha salva: o padrão');
    lembrarMotorista(penedo, 'marcio');
    assert.equal(motoristaDaUnidade(penedo).id, 'marcio');
    lembrarMotorista(palmeira, 'rogerio'); // escolha antiga, de quando todos apareciam nas duas unidades
    assert.equal(motoristaDaUnidade(palmeira).id, 'caique');
    lembrarMotorista(palmeira, 'outro', '  João   da Silva ');
    assert.deepEqual(motoristaDaUnidade(palmeira), { id: 'outro', nomeOutro: 'João da Silva' });
  });

  it('rascunho com motorista de outra unidade volta para o motorista da unidade', () => {
    const rascunho = novoRascunho(penedo);
    gravarRascunho(penedo, { ...rascunho, dados: { ...rascunho.dados, motoristaId: 'caique', kmSaida: '45210' } });
    const lido = lerRascunho(penedo);
    assert.equal(lido.dados.motoristaId, 'rogerio');
    assert.equal(lido.dados.kmSaida, '45210', 'o resto do rascunho fica como estava');
    gravarRascunho(penedo, { ...rascunho, dados: { ...rascunho.dados, motoristaId: 'marcio' } });
    assert.equal(lerRascunho(penedo).dados.motoristaId, 'marcio');
  });
});

describe('regras do checklist', () => {
  it('cria o registro com data e hora automáticas', () => {
    const quando = new Date('2026-11-24T08:15:30-03:00');
    const registro = novoRegistro({ outros: '  barulho na suspensão  ' }, quando);
    assert.match(registro.id, /^ck_[a-z0-9]+_[a-z0-9]{8}$/);
    assert.equal(registro.preenchidoEm, quando.toISOString());
    assert.equal(registro.unidade, 'penedo');
    assert.equal(registro.veiculo, 'Toyota Hilux Cabine Simples');
    assert.equal(registro.kmSaida, 45210);
    assert.equal(registro.kmVolta, null);
    assert.equal(registro.retornoEm, null);
    assert.equal(registro.outros, 'barulho na suspensão');
    assert.equal(registro.excluido, false);
    assert.ok(emRota(registro));
    assert.equal(kmRodados(registro), null);
  });

  it('aceita saída e volta no mesmo preenchimento', () => {
    const registro = novoRegistro({ kmVolta: 45392 });
    assert.equal(registro.kmVolta, 45392);
    assert.equal(registro.retornoEm, registro.preenchidoEm);
    assert.ok(!emRota(registro));
    assert.equal(kmRodados(registro), 182);
  });

  it('registra o retorno com a hora do retorno', () => {
    const saida = novoRegistro();
    const volta = registrarRetorno(saida, 45400, new Date('2026-11-24T17:40:00-03:00'));
    assert.equal(volta.kmVolta, 45400);
    assert.equal(volta.retornoEm, new Date('2026-11-24T17:40:00-03:00').toISOString());
    assert.equal(volta.preenchidoEm, saida.preenchidoEm);
    assert.equal(kmRodados(volta), 190);
  });

  it('valida motorista, quilometragem e itens', () => {
    const base = { motoristaId: 'rogerio', motoristaNome: 'Rogerio', kmSaida: 100, kmVolta: null, itens: ITENS_OK };
    assert.ok(validarChecklist(base).ok);
    assert.ok(validarChecklist({ ...base, motoristaId: null }).erros.motorista);
    assert.ok(validarChecklist({ ...base, motoristaId: 'outro', motoristaNome: '   ' }).erros.motorista);
    assert.ok(validarChecklist({ ...base, kmSaida: null }).erros.kmSaida);
    assert.ok(validarChecklist({ ...base, kmSaida: -1 }).erros.kmSaida);
    assert.ok(validarChecklist({ ...base, kmSaida: 10_000_000 }).erros.kmSaida);
    assert.ok(validarChecklist({ ...base, kmVolta: 99 }).erros.kmVolta);
    assert.ok(validarChecklist({ ...base, kmVolta: 100 }).ok, 'volta igual à saída é permitida');
    const faltando = validarChecklist({ ...base, itens: { ...ITENS_OK, oleo: undefined, estepe: 'talvez' } });
    assert.equal(faltando.erros.itens, 'Faltam avaliar 2 itens.');
    assert.deepEqual(faltando.itensFaltando.sort(), ['estepe', 'oleo']);
  });

  it('valida o KM de volta de uma viagem aberta', () => {
    const registro = novoRegistro();
    assert.match(validarRetorno(registro, null), /Informe/);
    assert.match(validarRetorno(registro, 45209), /menor/);
    assert.equal(validarRetorno(registro, 45210), null);
    assert.equal(validarRetorno(registro, 99999), null);
  });

  it('resume os itens e calcula a condição do veículo', () => {
    assert.deepEqual(
      (({ bom, ruim, faltante, condicao, completo, problemas }) => ({
        bom,
        ruim,
        faltante,
        condicao,
        completo,
        problemas
      }))(resumoDosItens({ ...ITENS_OK, estepe: 'faltante', pneusTraseiros: 'ruim' })),
      { bom: 5, ruim: 1, faltante: 1, condicao: 79, completo: true, problemas: 2 }
    );
    assert.equal(resumoDosItens(ITENS_OK).condicao, 100);
    assert.equal(resumoDosItens({}).progresso, 0);
    assert.equal(resumoDosItens({ farois: 'bom' }).progresso, 14);
  });

  it('acha o último KM do veículo da unidade', () => {
    const antigo = novoRegistro({ kmSaida: 100, kmVolta: 150 }, new Date('2026-11-20T08:00:00Z'));
    const recente = novoRegistro({ kmSaida: 150 }, new Date('2026-11-23T08:00:00Z'));
    const outra = { ...novoRegistro({ kmSaida: 9000 }, new Date('2026-11-24T08:00:00Z')), unidade: 'palmeira' };
    const excluido = { ...novoRegistro({ kmSaida: 7000 }, new Date('2026-11-24T09:00:00Z')), excluido: true };
    assert.equal(ultimoKm([antigo, recente, outra, excluido], 'penedo'), 150);
    assert.equal(ultimoKm([antigo], 'penedo'), 150);
    assert.equal(ultimoKm([], 'penedo'), null);
  });

  it('converte o texto do campo de KM', () => {
    assert.equal(paraKm(''), null);
    assert.equal(paraKm('045.210 km'), 45210);
    assert.equal(paraKm('12345678'), 1234567);
  });
});

describe('banco local', () => {
  beforeEach(() => banco.limpar());

  it('grava, marca como pendente e confirma o envio', () => {
    const salvo = banco.gravar(novoRegistro());
    assert.equal(banco.obter().registros.length, 1);
    assert.deepEqual(banco.pendentes(), [salvo.id]);
    banco.confirmarEnvio(salvo.id, salvo.atualizadoEm);
    assert.deepEqual(banco.pendentes(), []);
  });

  it('não confirma o envio se o registro mudou enquanto era enviado', () => {
    const primeiro = banco.gravar(novoRegistro());
    const segundo = banco.gravar({ ...primeiro, kmVolta: 45300 });
    assert.ok(segundo.atualizadoEm > primeiro.atualizadoEm);
    banco.confirmarEnvio(primeiro.id, primeiro.atualizadoEm);
    assert.deepEqual(banco.pendentes(), [primeiro.id]);
  });

  it('exclusão é lógica: some das telas e fica pendente de envio', () => {
    const salvo = banco.gravar(novoRegistro());
    banco.confirmarEnvio(salvo.id, salvo.atualizadoEm);
    banco.excluir(salvo.id);
    assert.equal(banco.obter().registros.length, 0);
    assert.equal(banco.registro(salvo.id).excluido, true);
    assert.deepEqual(banco.pendentes(), [salvo.id]);
  });

  it('junta registros da nuvem: vale a versão mais nova', () => {
    const local = banco.gravar(novoRegistro(), 1000);
    banco.confirmarEnvio(local.id, local.atualizadoEm);

    // versão mais nova vinda de outro aparelho substitui a local
    banco.aplicarRemotos([{ ...local, kmVolta: 45500, atualizadoEm: local.atualizadoEm + 10 }], 5000);
    assert.equal(banco.registro(local.id).kmVolta, 45500);
    assert.equal(banco.cursor(), 5000);

    // versão mais antiga é ignorada
    banco.aplicarRemotos([{ ...local, kmVolta: 1, atualizadoEm: local.atualizadoEm - 10 }], 6000);
    assert.equal(banco.registro(local.id).kmVolta, 45500);

    // alteração local mais nova que a da nuvem continua valendo e pendente
    const editado = banco.gravar({ ...banco.registro(local.id), outros: 'editado aqui' });
    banco.aplicarRemotos([{ ...local, outros: 'antigo', atualizadoEm: editado.atualizadoEm - 1 }], 7000);
    assert.equal(banco.registro(local.id).outros, 'editado aqui');
    assert.deepEqual(banco.pendentes(), [local.id]);

    // registro novo de outra unidade entra direto, sem ficar pendente
    const deFora = { ...novoRegistro({ kmSaida: 80000 }), unidade: 'palmeira' };
    banco.aplicarRemotos([deFora], 8000);
    assert.equal(banco.obter().registros.length, 2);
    assert.deepEqual(banco.pendentes(), [local.id]);
  });

  it('a mesma versão vinda da nuvem tira o registro da fila de envio', () => {
    const local = banco.gravar(novoRegistro());
    banco.aplicarRemotos([{ ...local }], 9000);
    assert.deepEqual(banco.pendentes(), []);
  });
});

describe('nuvem (Firestore REST)', () => {
  it('converte ida e volta os tipos usados no registro', () => {
    const registro = novoRegistro({ kmVolta: 45392, outros: 'texto com "aspas" e ç' });
    const ida = codificarCampos({ ...registro, decimal: 1.5, lista: [1, 'a', null] });
    assert.deepEqual(ida.kmSaida, { integerValue: '45210' });
    assert.deepEqual(ida.excluido, { booleanValue: false });
    assert.deepEqual(ida.itens.mapValue.fields.farois, { stringValue: 'bom' });
    assert.deepEqual(codificarCampos({ kmVolta: null }).kmVolta, { nullValue: null });
    assert.deepEqual(decodificarCampos(ida), { ...registro, decimal: 1.5, lista: [1, 'a', null] });
  });

  it('envia com carimbo do servidor e busca só o que mudou', async () => {
    const falso = criarFirestoreFalso();
    const nuvem = criarNuvem({ projeto: 'projeto-teste', requisitar: falso.requisitar });
    assert.ok(nuvem.ativa);

    const a = novoRegistro();
    const b = novoRegistro({ kmSaida: 500 });
    await nuvem.enviar(a);
    await nuvem.enviar(b);

    const envio = falso.estado.chamadas[0];
    assert.equal(envio.method, 'POST');
    assert.ok(envio.url.endsWith('/v1/projects/projeto-teste/databases/(default)/documents:commit'));
    assert.equal(
      envio.body.writes[0].update.name,
      `projects/projeto-teste/databases/(default)/documents/checklists/${a.id}`
    );
    assert.deepEqual(envio.body.writes[0].updateTransforms, [
      { fieldPath: 'servidorEm', setToServerValue: 'REQUEST_TIME' }
    ]);
    assert.equal(envio.body.writes[0].update.fields.servidorEm, undefined);

    const tudo = await nuvem.buscar(null);
    assert.deepEqual(
      tudo.registros.map(r => r.id),
      [a.id, b.id]
    );
    assert.ok(Number.isFinite(tudo.cursor));
    assert.equal(typeof tudo.registros[0].servidorEm, 'string');

    // nada novo: só relê a margem de segurança (último minuto antes do cursor) e o cursor não anda
    falso.avancarRelogio(10 * 60 * 1000);
    const nada = await nuvem.buscar(tudo.cursor);
    assert.deepEqual(
      nada.registros.map(r => r.id),
      [a.id, b.id]
    );
    assert.equal(nada.cursor, tudo.cursor);

    // um registro novo aparece na consulta seguinte e o cursor avança
    const c = novoRegistro({ kmSaida: 900 });
    await nuvem.enviar(c);
    const novo = await nuvem.buscar(tudo.cursor);
    assert.ok(novo.registros.some(r => r.id === c.id));
    assert.ok(novo.cursor > tudo.cursor);

    // depois que o cursor avança, os antigos (fora da margem) não são mais relidos
    falso.avancarRelogio(10 * 60 * 1000);
    const depois = await nuvem.buscar(novo.cursor);
    assert.deepEqual(
      depois.registros.map(r => r.id),
      [c.id]
    );
  });

  it('pagina resultados grandes', async () => {
    const falso = criarFirestoreFalso();
    const nuvem = criarNuvem({ projeto: 'projeto-teste', requisitar: falso.requisitar });
    for (let i = 0; i < 650; i++) await nuvem.enviar(novoRegistro({ kmSaida: i }));
    const { registros } = await nuvem.buscar(null);
    assert.equal(new Set(registros.map(r => r.id)).size, 650);
  });

  it('classifica os erros', async () => {
    const com = status =>
      criarNuvem({
        projeto: 'p',
        requisitar: async () => ({ ok: false, status, json: async () => ({ error: { message: 'x' } }) })
      });
    await assert.rejects(com(403).buscar(), { tipo: 'permissao' });
    await assert.rejects(com(404).buscar(), { tipo: 'configuracao' });
    await assert.rejects(com(400).enviar(novoRegistro()), { tipo: 'dados' });
    await assert.rejects(com(503).buscar(), { tipo: 'servidor' });
    const semRede = criarNuvem({
      projeto: 'p',
      requisitar: async () => {
        throw new TypeError('Failed to fetch');
      }
    });
    await assert.rejects(semRede.buscar(), { tipo: 'rede' });
    assert.equal(criarNuvem({ projeto: '' }).ativa, false);
  });
});

describe('sincronização', () => {
  const ambiente = ({ online = true } = {}) => ({
    navigator: { onLine: online },
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  });

  beforeEach(() => banco.limpar());

  it('envia os pendentes e baixa o que veio de outros aparelhos', async () => {
    const falso = criarFirestoreFalso();
    const nuvem = criarNuvem({ projeto: 'projeto-teste', requisitar: falso.requisitar });
    const sync = criarSincronizacao({ nuvem, ambiente: ambiente() });

    // outro aparelho já gravou um registro na nuvem
    const deFora = { ...novoRegistro({ kmSaida: 80000 }), unidade: 'palmeira', unidadeNome: 'Palmeira dos Índios' };
    await nuvem.enviar(deFora);

    const meu = banco.gravar(novoRegistro());
    const situacao = await sync.agora();

    assert.equal(situacao.fase, 'em-dia');
    assert.deepEqual(banco.pendentes(), []);
    assert.equal(banco.obter().registros.length, 2);
    assert.equal(falso.registro(meu.id).kmSaida, 45210);
    assert.ok(falso.registro(meu.id).servidorEm, 'o servidor carimbou o registro');

    // fechar a viagem aqui atualiza o documento na nuvem
    banco.gravar(registrarRetorno(banco.registro(meu.id), 45392));
    await sync.agora();
    assert.equal(falso.registro(meu.id).kmVolta, 45392);
    assert.deepEqual(banco.pendentes(), []);

    // exclusão feita pela administração chega aos outros aparelhos
    banco.excluir(deFora.id);
    await sync.agora();
    assert.equal(falso.registro(deFora.id).excluido, true);
  });

  it('sem internet nada se perde; ao voltar, envia', async () => {
    const falso = criarFirestoreFalso();
    const nuvem = criarNuvem({ projeto: 'projeto-teste', requisitar: falso.requisitar });
    const sync = criarSincronizacao({ nuvem, ambiente: ambiente() });

    falso.estado.offline = true;
    const meu = banco.gravar(novoRegistro());
    const fora = await sync.agora();
    assert.equal(fora.fase, 'offline');
    assert.deepEqual(banco.pendentes(), [meu.id]);
    assert.equal(falso.documentos.size, 0);

    falso.estado.offline = false;
    const volta = await sync.agora();
    assert.equal(volta.fase, 'em-dia');
    assert.deepEqual(banco.pendentes(), []);
    assert.equal(falso.documentos.size, 1);
  });

  it('respeita o aviso de "sem conexão" do navegador', async () => {
    const falso = criarFirestoreFalso();
    const nuvem = criarNuvem({ projeto: 'projeto-teste', requisitar: falso.requisitar });
    const sync = criarSincronizacao({ nuvem, ambiente: ambiente({ online: false }) });
    banco.gravar(novoRegistro());
    assert.equal((await sync.agora()).fase, 'offline');
    assert.equal(falso.estado.chamadas.length, 0);
  });

  it('um registro recusado não trava os demais', async () => {
    const falso = criarFirestoreFalso();
    const nuvem = criarNuvem({ projeto: 'projeto-teste', requisitar: falso.requisitar });
    const sync = criarSincronizacao({ nuvem, ambiente: ambiente() });
    const ruim = banco.gravar(novoRegistro({ kmSaida: 666 }));
    const bom = banco.gravar(novoRegistro({ kmSaida: 777 }));
    falso.estado.recusar = registro => registro.kmSaida === 666;

    const situacao = await sync.agora();
    assert.equal(situacao.fase, 'erro');
    assert.equal(situacao.recusados, 1);
    assert.deepEqual(banco.pendentes(), [ruim.id]);
    assert.ok(falso.registro(bom.id));
  });

  it('em modo local (sem projeto) não tenta falar com a nuvem', async () => {
    let chamou = false;
    const nuvem = criarNuvem({
      projeto: '',
      requisitar: async () => {
        chamou = true;
      }
    });
    const sync = criarSincronizacao({ nuvem, ambiente: ambiente() });
    banco.gravar(novoRegistro());
    assert.equal((await sync.agora()).fase, 'local');
    assert.equal(chamou, false);
    assert.equal(banco.pendentes().length, 1, 'fica guardado para quando o banco for conectado');
  });
});

describe('exportação', () => {
  it('gera CSV com ponto e vírgula e protege textos perigosos', () => {
    const registro = novoRegistro({ kmVolta: 45392, outros: '=SOMA(A1) "teste"; ok' });
    const [cabecalho, linha] = gerarCsv([registro]).split('\r\n');
    assert.ok(cabecalho.startsWith('Data;Hora;Unidade;Veículo;Motorista;KM saída;KM volta;KM rodados'));
    assert.ok(linha.includes(';Penedo;Toyota Hilux Cabine Simples;Rogerio;45210;45392;182;'));
    assert.ok(linha.includes(';Concluído;Bom;Bom;Bom;Bom;Bom;Bom;Bom;'));
    assert.ok(linha.endsWith(`"'=SOMA(A1) ""teste""; ok"`));
  });
});
