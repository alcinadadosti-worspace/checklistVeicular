// Teste de navegador: as 10 telas principais em 7 aparelhos — celular pequeno e grande, celular
// deitado, tablets em pé e deitados. Falha se alguma tela transbordar para os lados, se algo sair
// da tela ou se der erro; lista (sem falhar) botões menores que 40 px. Gera uma captura por tela.
// O banco fica BLOQUEADO; os dados são semeados no aparelho.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   node ~/.claude/skills/playwright/run.js tests/e2e/aparelhos.js
// Variáveis: TARGET_URL (padrão http://localhost:4173), SAIDA (capturas; padrão: pasta temporária),
//            SO (só alguns aparelhos, ex.: SO=cel-deitado,tablet-em-pe).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const SAIDA = path.join(process.env.SAIDA || path.join(os.tmpdir(), 'checklist-e2e'), 'aparelhos');
const SO = process.env.SO ? process.env.SO.split(',') : null;
fs.mkdirSync(SAIDA, { recursive: true });

const APARELHOS = {
  'cel-pequeno': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'cel-grande': { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true },
  'cel-deitado': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'tablet-em-pe': { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'tablet-android': { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  'tablet-deitado': { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'tablet-grande-deitado': {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
    isMobile: true,
    hasTouch: true
  }
};

const semear = ({ sessao, rascunho, estado }) => {
  const agora = Date.now();
  const registros = {};
  const ok = {
    farois: 'bom',
    estepe: 'bom',
    limpador: 'bom',
    pneusDianteiros: 'bom',
    pneusTraseiros: 'bom',
    calotas: 'bom',
    oleo: 'bom'
  };
  const base = [
    ['penedo', 'Penedo', 'Toyota Hilux Cabine Simples', 'rogerio', 'Rogerio', 45210],
    ['palmeira', 'Palmeira dos Índios', 'Volkswagen Saveiro 2025', 'caique', 'Caique', 18840]
  ];
  for (const [u, nome, veiculo, mid, m, km0] of base) {
    for (let i = 0; i < 5; i++) {
      const t = agora - i * 86400000 - 100 * 60000;
      const emRota = i === 0;
      const id = `ck_v_${u}_${i}`;
      registros[id] = {
        id,
        versao: 1,
        unidade: u,
        unidadeNome: nome,
        veiculo,
        motoristaId: mid,
        motoristaNome: m,
        kmSaida: km0 - i * 150,
        kmVolta: emRota ? null : km0 - i * 150 + 132,
        preenchidoEm: new Date(t).toISOString(),
        retornoEm: emRota ? null : new Date(t + 5 * 3600000).toISOString(),
        itens: {
          ...ok,
          ...(i === 1 ? { pneusTraseiros: 'ruim' } : {}),
          ...(i === 3 ? { estepe: 'faltante', oleo: 'ruim' } : {})
        },
        outros: i === 1 ? 'Pneu traseiro direito careca, precisa trocar antes da próxima viagem longa.' : '',
        fotos: i === 1 ? [{ id: 'ft_x', largura: 1280, altura: 960 }] : [],
        voltaPelaSaidaSeguinte: i === 2,
        excluido: false,
        criadoEm: t,
        atualizadoEm: t
      };
    }
  }
  localStorage.clear();
  localStorage.setItem('clv.dados.v1', JSON.stringify({ registros, pendentes: [], cursor: null }));
  sessionStorage.clear();
  if (sessao) localStorage.setItem('clv.sessao', JSON.stringify(sessao));
  // motorista escolhido nesta abertura do app (o app guarda no sessionStorage)
  if (sessao?.motorista) {
    sessionStorage.setItem(
      'clv.motorista',
      JSON.stringify({ unidadeId: sessao.unidadeId, motorista: sessao.motorista, escondidoEm: null })
    );
  }
  if (rascunho) localStorage.setItem('clv.rascunho.penedo', JSON.stringify(rascunho));
  if (estado) history.replaceState(estado, '');
};

const rogerio = { tipo: 'unidade', unidadeId: 'penedo', motorista: { id: 'rogerio', nomeOutro: '' } };
const itensMeio = { farois: 'bom', estepe: 'faltante', limpador: 'bom', pneusDianteiros: 'ruim' };
const itensTodos = {
  farois: 'bom',
  estepe: 'faltante',
  limpador: 'bom',
  pneusDianteiros: 'ruim',
  pneusTraseiros: 'bom',
  calotas: 'bom',
  oleo: 'bom'
};
const rascunho = itens => ({
  id: 'rs_auditoria',
  em: Date.now(),
  dados: { kmSaida: '45400', itens, outros: 'Barulho na suspensão.', fotos: [] }
});

const TELAS = [
  { nome: 'login', semente: {}, espera: '.teclado' },
  {
    nome: 'quem-acessa',
    semente: { sessao: { tipo: 'unidade', unidadeId: 'penedo' } },
    espera: '.tela--motorista',
    depois: async p => p.waitForFunction(() => document.querySelectorAll('.cracha-escolha__cartao img').length >= 2)
  },
  { nome: 'inicio', semente: { sessao: rogerio }, espera: '.tela--inicio' },
  {
    nome: 'passo1',
    semente: {
      sessao: rogerio,
      rascunho: rascunho({}),
      estado: { tela: 'checklist', formulario: 'rs_auditoria', passo: 0 }
    },
    espera: '.campo-km'
  },
  {
    nome: 'passo2',
    semente: {
      sessao: rogerio,
      rascunho: rascunho(itensMeio),
      estado: { tela: 'checklist', formulario: 'rs_auditoria', passo: 1 }
    },
    espera: '.itens'
  },
  {
    nome: 'passo3',
    semente: {
      sessao: rogerio,
      rascunho: rascunho(itensTodos),
      estado: { tela: 'checklist', formulario: 'rs_auditoria', passo: 2 }
    },
    espera: '.passo--revisao'
  },
  {
    nome: 'retorno',
    semente: { sessao: rogerio, estado: { tela: 'retorno', registro: 'ck_v_penedo_0' } },
    espera: '.tela--retorno'
  },
  {
    nome: 'sucesso',
    semente: { sessao: rogerio, estado: { tela: 'sucesso', registro: 'ck_v_penedo_1' } },
    espera: '.tela--sucesso'
  },
  { nome: 'admin', semente: { sessao: { tipo: 'admin' } }, espera: '.tela--admin' },
  {
    nome: 'admin-ficha',
    semente: { sessao: { tipo: 'admin' } },
    espera: '.tela--admin',
    depois: async p => {
      await p.locator('.lista-registros--admin .linha-registro button').nth(1).click();
      await p.waitForSelector('.folha');
    }
  }
];

const medir = () => {
  const largura = innerWidth;
  const doc = document.documentElement.scrollWidth;
  const pequenos = [];
  for (const el of document.querySelectorAll('button, a, input, textarea, select, [role="radio"]')) {
    // campo dentro de um <label>: o toque vale na caixa inteira do label
    const r = (el.tagName === 'INPUT' && el.closest('label') ? el.closest('label') : el).getBoundingClientRect();
    const estilo = getComputedStyle(el);
    if (
      r.width === 0 ||
      r.height === 0 ||
      estilo.visibility === 'hidden' ||
      el.closest('.visualmente-oculto') ||
      el.classList.contains('visualmente-oculto')
    )
      continue;
    if (el.tagName === 'INPUT' && el.type === 'file') continue;
    if (el.closest('[class*="folder-float"]')) continue; // bilhetes da pasta (React Bits): há a lista ao lado
    if (r.width < 40 || r.height < 40) {
      const rotulo = (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      pequenos.push(`${rotulo} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
  }
  const fora = [];
  for (const el of document.querySelectorAll('main *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > largura + 2 && !el.closest('canvas') && el.tagName !== 'CANVAS') {
      let pai = el.parentElement;
      let cortado = false;
      while (pai && pai !== document.body) {
        const ov = getComputedStyle(pai).overflowX;
        if (ov === 'hidden' || ov === 'auto' || ov === 'scroll' || ov === 'clip') {
          cortado = true;
          break;
        }
        pai = pai.parentElement;
      }
      if (!cortado)
        fora.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (dir ${Math.round(r.right)})`);
    }
  }
  return {
    transborda: doc > largura ? `${doc}px > ${largura}px` : '',
    pequenos: [...new Set(pequenos)].slice(0, 8),
    fora: [...new Set(fora)].slice(0, 5)
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const relatorio = [];
  for (const [aparelho, opcoes] of Object.entries(APARELHOS)) {
    if (SO && !SO.includes(aparelho)) continue;
    for (const tela of TELAS) {
      const contexto = await browser.newContext(opcoes);
      await contexto.route('**/firestore.googleapis.com/**', rota => rota.abort());
      const page = await contexto.newPage();
      const erros = [];
      page.on('pageerror', e => erros.push(e.message));
      try {
        await page.goto(TARGET_URL, { waitUntil: 'load' });
        await page.evaluate(semear, tela.semente);
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector(tela.espera, { timeout: 20000 });
        if (tela.depois) await tela.depois(page);
        await page.waitForTimeout(tela.nome === 'login' ? 2500 : 3500);
        const m = await page.evaluate(medir);
        await page.screenshot({ path: path.join(SAIDA, `${aparelho}--${tela.nome}.png`) });
        relatorio.push({ aparelho, tela: tela.nome, ...m, erros });
      } catch (erro) {
        relatorio.push({ aparelho, tela: tela.nome, falha: erro.message.split('\n')[0] });
      }
      await contexto.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
  let falhas = 0;
  for (const r of relatorio) {
    if (r.falha || r.transborda || r.fora?.length || r.erros?.length) falhas += 1;
    const partes = [];
    if (r.falha) partes.push(`FALHA ${r.falha}`);
    if (r.transborda) partes.push(`TRANSBORDA ${r.transborda}`);
    if (r.fora?.length) partes.push(`fora: ${r.fora.join('; ')}`);
    if (r.pequenos?.length) partes.push(`pequenos: ${r.pequenos.join('; ')}`);
    if (r.erros?.length) partes.push(`erros: ${r.erros.join('; ')}`);
    console.log(`${r.aparelho.padEnd(22)} ${r.tela.padEnd(12)} ${partes.join(' | ') || 'ok'}`);
  }
  console.log(`
${falhas === 0 ? 'TUDO CERTO' : `${falhas} tela(s) com problema`} — capturas em ${SAIDA}`);
  process.exitCode = falhas === 0 ? 0 : 1;
})();
