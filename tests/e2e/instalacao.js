// Teste de navegador: o app pode ser instalado na tela inicial (celular/tablet).
//  - o Chrome confirma que o app é instalável (manifesto, ícones, service worker);
//  - no Android, o botão "Instalar o app" aparece quando o navegador avisa e abre a instalação;
//  - no iPhone/iPad, aparece como instalar pelo Compartilhar; aberto pelo ícone, não aparece nada.
// O banco fica BLOQUEADO.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   node ~/.claude/skills/playwright/run.js tests/e2e/instalacao.js
// Variáveis: TARGET_URL (padrão http://localhost:4173).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const celular = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const abrir = async (opcoes, antes, { perfil = null } = {}) => {
    // Perfil próprio (não anônimo) quando é preciso: em janela anônima o Chrome nunca instala apps.
    const contexto = perfil
      ? await chromium.launchPersistentContext(perfil, { headless: true, channel: 'chromium', ...opcoes })
      : await browser.newContext(opcoes);
    await contexto.route('**/firestore.googleapis.com/**', rota => rota.abort());
    if (antes) await contexto.addInitScript(antes);
    const page = contexto.pages()[0] || (await contexto.newPage());
    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.waitForSelector('.teclado');
    return { contexto, page };
  };

  try {
    // 1) Android/Chrome: instalável?
    {
      const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-instalacao-'));
      const { contexto, page } = await abrir(celular, null, { perfil });
      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await contexto.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      conferir(
        'o Chrome considera o app instalável',
        installabilityErrors.length === 0,
        installabilityErrors.map(e => e.errorId).join(', ')
      );
      const { errors, data } = await cdp.send('Page.getAppManifest');
      const manifesto = JSON.parse(data || '{}');
      conferir('manifesto sem erros', errors.length === 0, errors.map(e => e.message).join('; '));
      conferir('gira com o aparelho (em pé e deitado)', manifesto.orientation === 'any', manifesto.orientation);
      conferir(
        'ícones PNG 192, 512 e adaptável',
        ['192x192', '512x512'].every(t => manifesto.icons?.some(i => i.sizes === t && i.type === 'image/png')) &&
          manifesto.icons?.some(i => i.purpose === 'maskable')
      );
      for (const icone of manifesto.icons || []) {
        const resposta = await page.request.get(new URL(icone.src, TARGET_URL).href);
        conferir(`ícone ${icone.src} existe`, resposta.ok(), String(resposta.status()));
      }
      const toque = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
      const respostaApple = await page.request.get(new URL(toque, TARGET_URL).href);
      conferir(
        'ícone do iPhone/iPad',
        respostaApple.ok() && /image\/png/.test(respostaApple.headers()['content-type'])
      );

      // O Chrome avisa sozinho que dá para instalar; se não avisar a tempo, o teste simula o aviso.
      const avisoReal = await page.waitForSelector('.instalar', { timeout: 8000 }).then(
        () => true,
        () => false
      );
      if (!avisoReal) {
        await page.evaluate(() => {
          const evento = new Event('beforeinstallprompt', { cancelable: true });
          evento.prompt = async () => {};
          evento.userChoice = Promise.resolve({ outcome: 'accepted' });
          window.dispatchEvent(evento);
        });
        await page.waitForSelector('.instalar', { timeout: 5000 });
      }
      conferir(
        'Android: botão "Instalar o app" no login',
        /Instalar o app/.test(await page.textContent('.instalar')),
        avisoReal ? 'o próprio Chrome ofereceu a instalação' : 'aviso simulado'
      );
      await page.tap('.instalar');
      await page.waitForTimeout(800);
      conferir('o botão abre a instalação e depois some', (await page.locator('.instalar').count()) === 0);
      await contexto.close();
      fs.rmSync(perfil, { recursive: true, force: true });
    }

    // 2) iPhone/iPad no Safari: mostra como instalar
    {
      const { contexto, page } = await abrir({ ...celular, userAgent: IPHONE });
      await page.waitForSelector('.instalar--ios', { timeout: 5000 });
      await page.tap('.instalar--ios .atalho');
      await page.waitForSelector('.instalar__dica');
      conferir(
        'iPhone: explica o "Adicionar à Tela de Início"',
        /Adicionar à Tela de Início/.test(await page.textContent('.instalar__dica'))
      );
      await contexto.close();
    }

    // 3) Aberto pelo ícone (já instalado): não oferece instalar
    {
      const { contexto, page } = await abrir({ ...celular, userAgent: IPHONE }, () => {
        Object.defineProperty(window.navigator, 'standalone', { get: () => true });
      });
      await page.waitForTimeout(800);
      conferir('app instalado: nada de "instalar"', (await page.locator('.instalar').count()) === 0);
      await contexto.close();
    }
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 5).join(' | '));
  }
  console.log(`\n${falhas === 0 ? 'TUDO CERTO' : `${falhas} falha(s)`}`);
  await browser.close();
  process.exitCode = falhas === 0 ? 0 : 1;
})();
