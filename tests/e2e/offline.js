// Teste de navegador: depois da primeira visita o app abre e funciona SEM internet — login,
// checklist inteiro e tela de retorno — e o registro fica guardado no aparelho para envio
// posterior. O banco fica BLOQUEADO.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal; o service worker
// só existe no build, não no `npm run dev`):
//   CODIGOS_TESTE="penedo=…" node ~/.claude/skills/playwright/run.js tests/e2e/offline.js
// Variável: TARGET_URL (padrão http://localhost:4173).
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const CODIGOS = Object.fromEntries(
  (process.env.CODIGOS_TESTE || '')
    .split(',')
    .map(par => par.trim().split('='))
    .filter(par => par.length === 2)
);
const CODIGO = CODIGOS.penedo;
if (!CODIGO) {
  console.log('Informe o código: CODIGOS_TESTE="penedo=…"');
  process.exit(1);
}

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
  const falhasDeRede = [];
  page.on('requestfailed', r => {
    if (!r.url().includes('firestore.googleapis.com')) {
      falhasDeRede.push(`${r.failure()?.errorText} ${r.url().replace(TARGET_URL, '')}`);
    }
  });
  page.on('pageerror', e => conferir('sem erros na página', false, e.message));

  try {
    // primeira visita (com internet): o service worker guarda os arquivos do app
    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    const sw = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      await new Promise(resolver => setTimeout(resolver, 3500));
      const nomes = await caches.keys();
      const cache = await caches.open(nomes[nomes.length - 1]);
      return { guardados: (await cache.keys()).length, controla: Boolean(navigator.serviceWorker.controller) };
    });
    conferir('service worker ativo e arquivos guardados', sw.controla && sw.guardados > 20, `${sw.guardados} arquivos`);

    await contexto.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.teclado', { timeout: 15000 });
    conferir('login abre sem internet', true);
    for (const d of CODIGO) await page.tap(`.tecla:text-is("${d}")`);
    await page.waitForSelector('.tela--inicio', { timeout: 15000 });
    await page.waitForSelector('.lanyard-canvas', { timeout: 20000 });
    conferir('início e crachá 3D sem internet', true);

    await page.tap('.inicio__acoes .botao');
    await page.waitForSelector('.tela--checklist', { timeout: 15000 });
    await page.tap('.assistente__rodape .botao--g');
    await page.waitForSelector('.campo-km');
    await page.waitForTimeout(3500);
    const canvases = await page.evaluate(() => document.querySelectorAll('.palco--veiculo canvas').length);
    conferir('carro 3D sem internet', canvases >= 1, `${canvases} canvas`);
    await page.locator('.campo-km__entrada').first().fill('52000');
    await page.tap('.assistente__rodape .botao--g');
    await page.waitForSelector('.itens');
    for (const item of await page.locator('.item').all()) await item.locator('.opcao[data-tipo="bom"]').click();
    await page.tap('.assistente__rodape .botao--g');
    await page.waitForSelector('.passo--revisao');
    await page.tap('.assistente__rodape .botao--g');
    await page.waitForSelector('.tela--sucesso', { timeout: 15000 });
    conferir('checklist enviado sem internet', true);

    await page.tap('.sucesso .botao--g');
    await page.waitForSelector('.tela--inicio');
    await page.tap('.viagem .botao');
    await page.waitForSelector('.tela--retorno', { timeout: 15000 });
    conferir('tela de retorno abre sem internet', true);

    const dados = await page.evaluate(() => JSON.parse(localStorage.getItem('clv.dados.v1')));
    conferir(
      'registro guardado no aparelho, na fila de envio',
      Object.keys(dados.registros).length === 1 && dados.pendentes.length === 1
    );
    conferir('nenhum arquivo do app faltou offline', falhasDeRede.length === 0, falhasDeRede.slice(0, 5).join(' | '));
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 3).join(' | '));
    if (falhasDeRede.length) console.log('  pedidos que falharam:', falhasDeRede.slice(0, 10).join(' | '));
  }
  console.log(`\n${falhas === 0 ? 'TUDO CERTO' : `${falhas} falha(s)`}`);
  await browser.close();
  process.exitCode = falhas === 0 ? 0 : 1;
})();
