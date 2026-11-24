// Capturas das telas principais com dados semeados — login, início com viagem em rota, histórico,
// passo 1 do checklist e lista da administração — no celular e no computador. Serve para revisar
// o visual depois de mexer no CSS. O banco fica BLOQUEADO.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   node ~/.claude/skills/playwright/run.js tests/e2e/capturas.js
// Variáveis: TARGET_URL (padrão http://localhost:4173), SAIDA (pasta das capturas; padrão: pasta
//            temporária do sistema).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const SAIDA = process.env.SAIDA || path.join(os.tmpdir(), 'checklist-e2e');
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};

// 5 dias de checklists por unidade; o de hoje ainda está em rota.
const semear = sessao => {
  const agora = Date.now();
  const registros = {};
  const itensOk = {
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
          ...itensOk,
          ...(i === 1 ? { pneusTraseiros: 'ruim' } : {}),
          ...(i === 3 ? { estepe: 'faltante', oleo: 'ruim' } : {})
        },
        outros: i === 1 ? 'Pneu traseiro direito careca.' : '',
        excluido: false,
        criadoEm: t,
        atualizadoEm: t
      };
    }
  }
  localStorage.clear();
  localStorage.setItem('clv.dados.v1', JSON.stringify({ registros, pendentes: [], cursor: null }));
  if (sessao) localStorage.setItem('clv.sessao', JSON.stringify(sessao));
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const problemas = [];
  const abrir = async (opcoes, sessao) => {
    const contexto = await browser.newContext(opcoes);
    await contexto.route('**/firestore.googleapis.com/**', rota => rota.abort()); // nunca toca o banco real
    const page = await contexto.newPage();
    page.on('pageerror', e => problemas.push(`[pageerror] ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) {
        problemas.push(`[console] ${m.text().slice(0, 200)}`);
      }
    });
    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.evaluate(semear, sessao);
    await page.reload({ waitUntil: 'load' });
    return { contexto, page };
  };
  const foto = async (page, nome) => {
    await page.screenshot({ path: path.join(SAIDA, `tela-${nome}.png`) });
    const l = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: innerWidth }));
    conferir(
      `captura "${nome}" sem rolagem lateral`,
      l.doc <= l.janela,
      l.doc > l.janela ? `${l.doc}px > ${l.janela}px` : ''
    );
  };
  const celular = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const desktop = { viewport: { width: 1366, height: 820 } };

  try {
    for (const [nome, opcoes] of [
      ['login-celular', celular],
      ['login-desktop', desktop]
    ]) {
      const { contexto, page } = await abrir(opcoes, null);
      await page.waitForSelector('.teclado');
      await page.waitForTimeout(4500);
      await foto(page, nome);
      await contexto.close();
    }
    for (const [nome, opcoes] of [
      ['rota-celular', celular],
      ['rota-desktop', desktop]
    ]) {
      const { contexto, page } = await abrir(opcoes, { tipo: 'unidade', unidadeId: 'penedo' });
      await page.waitForSelector('.tela--inicio');
      await page.waitForTimeout(5000);
      await foto(page, `${nome}-topo`);
      await page.evaluate(() => document.querySelector('.viagem').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(4500);
      await foto(page, `${nome}-viagem`);
      await page.evaluate(() => document.querySelector('.historico').scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(1500);
      await foto(page, `${nome}-historico`);
      if (opcoes === celular) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.tap('.inicio__acoes .botao');
        await page.waitForSelector('.tela--checklist');
        await page.waitForTimeout(4000);
        await foto(page, 'passo1-celular');
      }
      await contexto.close();
    }
    {
      const { contexto, page } = await abrir(celular, { tipo: 'admin' });
      await page.waitForSelector('.tela--admin');
      await page.waitForTimeout(3000);
      await page.evaluate(() => document.querySelector('.lista-registros--admin').scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(1200);
      await foto(page, 'admin-lista-celular');
      await contexto.close();
    }
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 4).join(' | '));
  }
  conferir('sem erros na página', problemas.length === 0, [...new Set(problemas)].slice(0, 5).join(' | '));
  console.log(`\n${falhas === 0 ? 'TUDO CERTO' : `${falhas} falha(s)`} — capturas em ${SAIDA}`);
  await browser.close();
  process.exitCode = falhas === 0 ? 0 : 1;
})();
