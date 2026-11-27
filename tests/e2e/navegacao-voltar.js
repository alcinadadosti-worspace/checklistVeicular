// Teste de navegador: botão "voltar" do celular/navegador dentro do app — passos do assistente,
// botão Voltar do rodapé, trilho de etapas, recarregar no meio do formulário (rascunho), tela de
// sucesso e sair. O banco fica BLOQUEADO.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   node ~/.claude/skills/playwright/run.js tests/e2e/navegacao-voltar.js
// Variável: TARGET_URL (padrão http://localhost:4173).
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await contexto.route('**/firestore.googleapis.com/**', rota => rota.abort()); // nunca toca o banco real
  const page = await contexto.newPage();
  page.on('pageerror', e => conferir('sem erros na página', false, e.message));

  // Espera a tela (e, no assistente, a etapa) esperada; devolve o que estava na tela.
  const onde = async (descricao, tela, etapa) => {
    const chegou = await page
      .waitForFunction(
        ([classe, nome]) => {
          const telas = document.querySelectorAll('main.tela');
          if (telas.length !== 1 || !telas[0].classList.contains(classe)) return false;
          if (!nome) return true;
          return document.querySelector('.trilho li[data-estado="atual"] .trilho__nome')?.textContent === nome;
        },
        [tela, etapa],
        { timeout: 6000 }
      )
      .then(
        () => true,
        () => false
      );
    const visto = await page.evaluate(() => ({
      tela: [...document.querySelectorAll('main.tela')].map(m => m.className.replace('tela ', '')).join('+'),
      etapa: document.querySelector('.trilho li[data-estado="atual"] .trilho__nome')?.textContent || ''
    }));
    conferir(descricao, chegou, `${visto.tela}${visto.etapa ? ` (${visto.etapa})` : ''}`);
  };
  const continuar = () => page.tap('.assistente__rodape .botao--g');

  try {
    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('clv.sessao', JSON.stringify({ tipo: 'unidade', unidadeId: 'penedo' }));
    });
    await page.reload({ waitUntil: 'load' });
    // sessão de antes da escolha por crachá (sem motorista): pergunta quem está acessando
    await onde('sessão sem motorista -> quem está acessando', 'tela--motorista');
    await page.tap('.cracha-escolha__botao[aria-label="Entrar como Rogerio"]');
    await onde('tocar no crachá -> início', 'tela--inicio');
    await page.tap('.inicio__trocar');
    await onde('trocar motorista', 'tela--motorista');
    await page.evaluate(() => history.back());
    await onde('voltar do navegador na troca -> início, sem trocar', 'tela--inicio');
    await page.tap('.inicio__trocar');
    await onde('trocar motorista de novo', 'tela--motorista');
    await page.tap('.topo .botao-icone[aria-label="Voltar"]');
    await onde('botão Voltar do topo na troca -> início', 'tela--inicio');
    await page.tap('.inicio__acoes .botao');
    await onde('abre o checklist no passo 1', 'tela--checklist', 'Veículo');
    await page.locator('.campo-km__entrada').first().fill('1000');
    await continuar();
    await onde('continuar -> passo 2', 'tela--checklist', 'Inspeção');
    await page.evaluate(() => history.back());
    await onde('voltar do navegador -> passo 1', 'tela--checklist', 'Veículo');
    await continuar();
    await onde('continuar de novo -> passo 2', 'tela--checklist', 'Inspeção');
    await page.tap('.assistente__rodape .botao--fantasma');
    await onde('botão Voltar do rodapé -> passo 1', 'tela--checklist', 'Veículo');
    await continuar();
    await onde('continuar -> passo 2', 'tela--checklist', 'Inspeção');
    // espera a etapa terminar de entrar (a anterior sai antes, com animação)
    await page.waitForFunction(() => document.querySelectorAll('.itens .item').length === 7);
    await page.waitForTimeout(400);
    for (const item of await page.locator('.itens .item').all()) await item.locator('.opcao[data-tipo="bom"]').click();
    await continuar();
    await onde('continuar -> passo 3', 'tela--checklist', 'Revisão');
    await page.locator('.trilho li button').first().click();
    await onde('trilho -> passo 1', 'tela--checklist', 'Veículo');
    for (let i = 0; i < 2; i++) {
      await continuar();
      await page.waitForTimeout(500);
    }
    await onde('2x continuar -> passo 3', 'tela--checklist', 'Revisão');

    await page.reload({ waitUntil: 'load' });
    await onde('recarregar no meio do formulário mantém o passo', 'tela--checklist', 'Revisão');
    const km = await page.locator('.ficha dd.mono').first().textContent();
    conferir('rascunho preservado ao recarregar', km === '1.000', km);

    await continuar();
    await onde('enviar -> sucesso', 'tela--sucesso');
    await page.evaluate(() => history.back());
    await onde('voltar na tela de sucesso -> início (não reabre o formulário)', 'tela--inicio');
    await page.evaluate(() => history.forward());
    await onde('avançar -> sucesso de novo', 'tela--sucesso');
    await page.evaluate(() => history.back());
    await onde('voltar -> início', 'tela--inicio');
    await page.tap('.topo .botao-icone[aria-label="Sair"]');
    await onde('sair -> login', 'tela--login');

    // Voltar depois de sair: ou sai do app (era a primeira página) ou fica no login.
    await page.evaluate(() => history.back()).catch(() => {});
    await page.waitForTimeout(1500);
    const url = page.url();
    const tela = url.startsWith(TARGET_URL)
      ? await page
          .evaluate(() => [...document.querySelectorAll('main.tela')].map(m => m.className).join('+'))
          .catch(() => '')
      : '';
    conferir(
      'voltar depois de sair não reabre telas internas',
      !url.startsWith(TARGET_URL) || tela.includes('tela--login'),
      url.startsWith(TARGET_URL) ? tela : `saiu do app (${url})`
    );
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 5).join(' | '));
  }
  console.log(`\n${falhas === 0 ? 'TUDO CERTO' : `${falhas} falha(s)`}`);
  await browser.close();
  process.exitCode = falhas === 0 ? 0 : 1;
})();
