// Teste de navegador: fluxo completo do motorista (login -> 4 passos -> envio -> retorno), com uma
// captura de tela por etapa. O banco de dados fica BLOQUEADO: nada é gravado na nuvem.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   CODIGOS_TESTE="penedo=…" node ~/.claude/skills/playwright/run.js tests/e2e/fluxo-motorista.js
// Variáveis: UNIDADE (penedo | palmeira; padrão penedo), MODO (celular | desktop; padrão celular),
//            TARGET_URL (padrão http://localhost:4173), SAIDA (pasta das capturas; padrão: pasta
//            temporária do sistema). Os códigos de acesso vêm só de CODIGOS_TESTE (repositório público).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const SAIDA = process.env.SAIDA || path.join(os.tmpdir(), 'checklist-e2e');
const UNIDADE = process.env.UNIDADE || 'penedo';
const MODO = process.env.MODO || 'celular';
const PREFIXO = process.env.PREFIXO || `motorista-${MODO}-${UNIDADE}`;
const CODIGOS = Object.fromEntries(
  (process.env.CODIGOS_TESTE || '')
    .split(',')
    .map(par => par.trim().split('='))
    .filter(par => par.length === 2)
);
const CODIGO = CODIGOS[UNIDADE];
// Motoristas que aparecem no passo 1 de cada unidade (o primeiro é o padrão), antes do "Outro".
const MOTORISTAS_DA_UNIDADE = { penedo: ['Rogerio', 'Marcio'], palmeira: ['Caique', 'Pedro'] };
const [PRINCIPAL, SEGUNDO] = MOTORISTAS_DA_UNIDADE[UNIDADE] || [];
if (!PRINCIPAL) {
  console.log(`UNIDADE desconhecida: ${UNIDADE}`);
  process.exit(1);
}
if (!CODIGO) {
  console.log(`Informe o código da unidade: CODIGOS_TESTE="${UNIDADE}=…"`);
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

const contextos = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1366, height: 820 } }
};

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};

(async () => {
  // Sem janela, mas com a GPU de verdade (com janela visível o WebGL trava atrás de outras janelas).
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const contexto = await browser.newContext(contextos[MODO]);
  await contexto.route('**/firestore.googleapis.com/**', rota => rota.abort()); // nunca toca o banco real
  const page = await contexto.newPage();
  const erros = [];
  page.on('console', m => {
    const texto = m.text();
    if (/Failed to load resource|net::ERR_FAILED|matter-js/.test(texto)) return; // banco bloqueado / aviso inofensivo
    if (m.type() === 'error' || m.type() === 'warning') erros.push(`[${m.type()}] ${texto.slice(0, 300)}`);
  });
  page.on('pageerror', e => erros.push(`[pageerror] ${e.message}`));
  let n = 0;
  const foto = async (nome, opcoes = {}) => {
    n += 1;
    const arquivo = path.join(SAIDA, `${PREFIXO}-${String(n).padStart(2, '0')}-${nome}.png`);
    await page.screenshot({ path: arquivo, ...opcoes });
    const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: innerWidth }));
    if (largura.doc > largura.janela)
      conferir(`sem rolagem lateral em "${nome}"`, false, `${largura.doc}px > ${largura.janela}px`);
  };
  const tocar = seletor => (MODO === 'celular' ? page.tap(seletor) : page.click(seletor));
  const continuar = () => tocar('.assistente__rodape .botao--g');

  try {
    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.teclado');
    await page.waitForTimeout(1500);
    for (const d of CODIGO) await tocar(`.tecla:text-is("${d}")`);
    await page.waitForSelector('.tela--inicio', { timeout: 20000 });
    conferir('login com o código da unidade', true);
    await page.waitForTimeout(5500);
    await foto('inicio');
    await foto('inicio-inteira', { fullPage: true });

    // passo 1 — motorista
    await tocar('.inicio__acoes .botao');
    await page.waitForSelector('.tela--checklist');
    await page.waitForTimeout(4500);
    await foto('passo1-motorista');
    const opcoes = await page.locator('.motorista strong').allTextContents();
    conferir(
      'opções de motorista da unidade',
      opcoes.join('|') === [PRINCIPAL, SEGUNDO, 'Outro'].join('|'),
      opcoes.join(', ')
    );
    conferir(
      'motorista padrão já vem marcado',
      (await page.locator('.motorista[data-ativo] strong').textContent()) === PRINCIPAL
    );
    await tocar('.motorista:has-text("Outro")');
    await page.fill('#nome-outro', 'Marcos Vinícius');
    await page.waitForTimeout(2500);
    await foto('passo1-outro');
    await tocar(`.motorista:has-text("${SEGUNDO}")`);
    await page.waitForTimeout(2200);
    await foto(`passo1-${SEGUNDO.toLowerCase()}`);
    await tocar(`.motorista:has-text("${PRINCIPAL}")`);
    await page.waitForTimeout(1200);

    // passo 2 — veículo e KM
    await continuar();
    await page.waitForSelector('.campo-km');
    await page.waitForTimeout(6000);
    await foto('passo2-veiculo');
    await continuar(); // sem KM: deve ser recusado
    await page.waitForTimeout(700);
    conferir('KM de saída vazio é recusado', (await page.locator('.campo-km[data-erro]').count()) === 1);
    await foto('passo2-erro');
    await page.locator('.campo-km__entrada').first().fill('45210');
    await page.waitForTimeout(900);
    await foto('passo2-km', { fullPage: true });

    // passo 3 — inspeção
    await continuar();
    await page.waitForSelector('.itens');
    await page.waitForTimeout(1200);
    await foto('passo3-vazio');
    const itens = page.locator('.item');
    const total = await itens.count();
    conferir('7 itens de inspeção', total === 7, `${total}`);
    for (let i = 0; i < total; i++) {
      const tipo = i === 1 ? 'faltante' : i === 4 ? 'ruim' : 'bom';
      if (i === 5) {
        await continuar(); // faltando itens: deve ser cobrado
        await page.waitForTimeout(900);
        conferir('itens sem resposta são cobrados', (await page.locator('.campo__erro--bloco').count()) === 1);
        await foto('passo3-faltando');
      }
      await itens.nth(i).locator(`.opcao[data-tipo="${tipo}"]`).scrollIntoViewIfNeeded();
      await itens.nth(i).locator(`.opcao[data-tipo="${tipo}"]`).click();
      await page.waitForTimeout(250);
    }
    await page.fill('#outros', 'Barulho na suspensão dianteira ao passar em lombada.');
    await page.waitForTimeout(900);
    await foto('passo3-completo', { fullPage: true });

    // passo 4 — revisão e envio
    await continuar();
    await page.waitForSelector('.passo--revisao');
    await page.waitForTimeout(2200);
    await foto('passo4-revisao', { fullPage: true });
    await continuar();
    await page.waitForSelector('.tela--sucesso', { timeout: 15000 });
    await page.waitForTimeout(3800);
    await foto('sucesso-saida');
    const estado = await page.evaluate(() => history.state);
    conferir('depois do envio o "voltar" não reabre o formulário', estado?.tela === 'sucesso', JSON.stringify(estado));

    await tocar('.sucesso .botao--g');
    await page.waitForSelector('.tela--inicio');
    await page.waitForTimeout(4500);
    conferir('veículo aparece em rota', (await page.locator('.viagem').count()) === 1);
    await foto('inicio-em-rota', { fullPage: true });

    // retorno
    await tocar('.viagem .botao');
    await page.waitForSelector('.tela--retorno');
    await page.waitForTimeout(3000);
    await foto('retorno');
    await page.locator('.campo-km__entrada').fill('45392');
    await page.waitForTimeout(1600);
    await foto('retorno-km', { fullPage: true });
    await tocar('.passo__campos .botao--g');
    await page.waitForSelector('.tela--sucesso', { timeout: 15000 });
    await page.waitForTimeout(3800);
    await foto('sucesso-retorno');
    await tocar('.sucesso .botao--g');
    await page.waitForSelector('.tela--inicio');
    await page.waitForTimeout(4000);
    conferir('viagem encerrada', (await page.locator('.viagem').count()) === 0);
    await foto('inicio-final', { fullPage: true });

    // pasta do histórico e ficha
    await page.locator('.folder-float__trigger').first().scrollIntoViewIfNeeded();
    await page.locator('.folder-float__trigger').first().click();
    await page.waitForTimeout(1800);
    await foto('pasta-aberta');
    await page.locator('.linha-registro button').first().click();
    await page.waitForTimeout(900);
    conferir('ficha do checklist abre', (await page.locator('.folha').count()) === 1);
    await foto('detalhe');

    const registros = await page.evaluate(() =>
      Object.values(JSON.parse(localStorage.getItem('clv.dados.v1') || '{"registros":{}}').registros)
    );
    const r = registros[0] || {};
    conferir('um registro gravado no aparelho', registros.length === 1, `${registros.length}`);
    conferir(
      'dados do registro',
      r.motoristaNome === PRINCIPAL &&
        r.kmSaida === 45210 &&
        r.kmVolta === 45392 &&
        r.itens?.estepe === 'faltante' &&
        r.itens?.pneusTraseiros === 'ruim' &&
        /Barulho/.test(r.outros || ''),
      `${r.motoristaNome} ${r.kmSaida}->${r.kmVolta}`
    );
    conferir(
      'data/hora de saída e de retorno gravadas',
      !Number.isNaN(Date.parse(r.preenchidoEm)) && !Number.isNaN(Date.parse(r.retornoEm))
    );
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 6).join(' | '));
    try {
      await page.screenshot({ path: path.join(SAIDA, `${PREFIXO}-ERRO.png`) });
    } catch {
      /* sem captura */
    }
  }
  conferir('sem erros no console', erros.length === 0, erros.slice(0, 5).join(' | '));
  console.log(`\n${falhas === 0 ? 'TUDO CERTO' : `${falhas} falha(s)`} — capturas em ${SAIDA}`);
  await browser.close();
  process.exitCode = falhas === 0 ? 0 : 1;
})();
