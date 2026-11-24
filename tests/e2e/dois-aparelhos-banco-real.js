// Teste de navegador CONTRA O BANCO REAL (produção): dois "aparelhos" ao mesmo tempo —
//   A = celular do motorista (Penedo)      B = computador da administração.
// Confere: envio e retorno chegam ao outro aparelho, fila offline, exclusão pela administração.
//
// SEGURANÇA: só cria e mexe em registros com motorista "TESTE AUTOMATICO" e apaga todos no final
// (mesmo se o teste falhar). Enquanto roda, a administração pode ver esse registro por ~1 minuto.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   CODIGOS_TESTE="penedo=…,admin=…" node ~/.claude/skills/playwright/run.js tests/e2e/dois-aparelhos-banco-real.js
// Variáveis: TARGET_URL (padrão http://localhost:4173), SAIDA (capturas), FIREBASE_PROJECT_ID.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const SAIDA = process.env.SAIDA || path.join(os.tmpdir(), 'checklist-e2e');
const PROJETO = process.env.FIREBASE_PROJECT_ID || 'checklistveicular-6a274';
const NOME = 'TESTE AUTOMATICO';
const CODIGOS = Object.fromEntries(
  (process.env.CODIGOS_TESTE || '')
    .split(',')
    .map(par => par.trim().split('='))
    .filter(par => par.length === 2)
);
const COD_UNIDADE = CODIGOS.penedo;
const COD_ADMIN = CODIGOS.admin;
if (!COD_UNIDADE || !COD_ADMIN) {
  console.log('Informe os códigos: CODIGOS_TESTE="penedo=…,admin=…"');
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};

// Registros de teste no banco real (só os do motorista "TESTE AUTOMATICO").
const RAIZ = 'https://firestore.googleapis.com/v1/';
const DOCUMENTOS = `projects/${PROJETO}/databases/(default)/documents`;
const registrosDeTeste = async () => {
  const resposta = await fetch(`${RAIZ}${DOCUMENTOS}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'checklists' }],
        where: { fieldFilter: { field: { fieldPath: 'motoristaNome' }, op: 'EQUAL', value: { stringValue: NOME } } }
      }
    })
  });
  if (!resposta.ok) throw new Error(`consulta ao banco falhou: HTTP ${resposta.status}`);
  return (await resposta.json()).map(linha => linha.document).filter(Boolean);
};
// Marca como excluído (as regras só deixam apagar o que já está excluído) e apaga.
const limparBanco = async () => {
  const documentos = await registrosDeTeste();
  for (const documento of documentos) {
    if (!documento.fields?.excluido?.booleanValue) {
      const marcar = await fetch(`${RAIZ}${documento.name}?updateMask.fieldPaths=excluido`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { excluido: { booleanValue: true } } })
      });
      if (!marcar.ok) console.log(`  (limpeza: não consegui marcar ${documento.name}: HTTP ${marcar.status})`);
    }
    const apagar = await fetch(`${RAIZ}${documento.name}`, { method: 'DELETE' });
    if (!apagar.ok) console.log(`  (limpeza: não consegui apagar ${documento.name}: HTTP ${apagar.status})`);
  }
  return documentos.length;
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctxA = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const erros = [];
  for (const [nome, pagina] of [
    ['A', A],
    ['B', B]
  ]) {
    pagina.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
        erros.push(`[${nome} console] ${m.text().slice(0, 300)}`);
      }
    });
    pagina.on('pageerror', e => erros.push(`[${nome} pageerror] ${e.message}`));
    pagina.on('requestfailed', r => {
      // ERR_ABORTED = consulta cancelada porque outra começou; não é problema.
      if (r.url().includes('googleapis') && r.failure()?.errorText !== 'net::ERR_ABORTED') {
        erros.push(`[${nome} rede] ${r.failure()?.errorText} ${r.method()} ${r.url().slice(0, 110)}`);
      }
    });
  }

  const entrar = async (pagina, codigo) => {
    await pagina.goto(TARGET_URL, { waitUntil: 'load' });
    await pagina.evaluate(() => localStorage.clear());
    await pagina.reload({ waitUntil: 'load' });
    await pagina.waitForSelector('.teclado');
    await pagina.waitForTimeout(700);
    for (const d of codigo) await pagina.click(`.tecla:text-is("${d}")`);
  };
  const situacao = pagina =>
    pagina.evaluate(() => ({
      rotulo: document.querySelector('.status-nuvem__botao')?.getAttribute('aria-label') || '(sem indicador)',
      pendentes: (JSON.parse(localStorage.getItem('clv.dados.v1') || '{"pendentes":[]}').pendentes || []).length
    }));
  const esperarSincronizado = async (pagina, rotulo, limite = 20000) => {
    const inicio = Date.now();
    let estado;
    do {
      await pagina.waitForTimeout(500);
      estado = await situacao(pagina);
    } while ((estado.pendentes > 0 || !estado.rotulo.includes('Sincronizado')) && Date.now() - inicio < limite);
    conferir(
      `${rotulo}: sincronizado`,
      estado.pendentes === 0 && estado.rotulo.includes('Sincronizado'),
      `${estado.rotulo}; pendentes ${estado.pendentes}; ${Date.now() - inicio} ms`
    );
  };
  const sincronizarAgora = async pagina => {
    await pagina.click('.status-nuvem__botao');
    await pagina.click('.status-nuvem__painel .botao');
    await pagina.keyboard.press('Escape');
    await pagina.waitForTimeout(2500);
  };
  const preencher = async (pagina, km) => {
    await pagina.click('.inicio__acoes .botao');
    await pagina.waitForSelector('.tela--checklist');
    await pagina.click('.motorista:has-text("Outro")');
    await pagina.fill('#nome-outro', NOME);
    await pagina.click('.assistente__rodape .botao--g');
    await pagina.waitForSelector('.campo-km');
    await pagina.locator('.campo-km__entrada').first().fill(String(km));
    await pagina.click('.assistente__rodape .botao--g');
    await pagina.waitForSelector('.itens');
    for (const item of await pagina.locator('.item').all()) await item.locator('.opcao[data-tipo="bom"]').click();
    await pagina.click('.assistente__rodape .botao--g');
    await pagina.waitForSelector('.passo--revisao');
    await pagina.click('.assistente__rodape .botao--g');
    await pagina.waitForSelector('.tela--sucesso', { timeout: 15000 });
  };
  // Sempre escopado ao registro de teste: nunca clicar em viagens/registros reais.
  const linhaB = B.locator('.lista-registros--admin .linha-registro', { hasText: NOME });

  try {
    const sobras = await limparBanco();
    if (sobras) console.log(`  (removidos ${sobras} registro(s) de teste que tinham sobrado de outra execução)`);

    console.log('1) Motorista entra e o app sincroniza com a nuvem');
    await entrar(A, COD_UNIDADE);
    await A.waitForSelector('.tela--inicio', { timeout: 20000 });
    await esperarSincronizado(A, 'A (motorista) ao abrir');

    console.log('2) Motorista envia um checklist de saída');
    await preencher(A, 77000);
    await esperarSincronizado(A, 'A depois de enviar');
    await A.screenshot({ path: path.join(SAIDA, 'banco-real-A-sucesso.png') });

    console.log('3) Administração, em outro aparelho, vê o checklist');
    await entrar(B, COD_ADMIN);
    await B.waitForSelector('.tela--admin', { timeout: 20000 });
    await esperarSincronizado(B, 'B (administração) ao abrir');
    await B.waitForTimeout(1500);
    conferir('B vê o checklist do motorista', (await linhaB.count()) === 1);
    conferir('B mostra o veículo em rota', (await linhaB.first().locator('.selo--rota').count()) === 1);
    await B.screenshot({ path: path.join(SAIDA, 'banco-real-B-admin.png') });

    console.log('4) Motorista registra o retorno; a administração recebe');
    await A.click('.sucesso .botao--g');
    await A.waitForSelector('.tela--inicio');
    await A.locator('.viagem', { hasText: NOME }).locator('.botao').click();
    await A.waitForSelector('.tela--retorno');
    await A.locator('.campo-km__entrada').fill('77123');
    await A.click('.passo__campos .botao--g');
    await A.waitForSelector('.tela--sucesso', { timeout: 15000 });
    await esperarSincronizado(A, 'A depois do retorno');
    await sincronizarAgora(B);
    const textoB = (await linhaB.first().innerText()).replace(/\s+/g, ' ');
    conferir(
      'B vê o KM de volta e a distância',
      textoB.includes('77.123') && textoB.includes('123 km'),
      textoB.slice(0, 90)
    );

    console.log('5) Sem internet: salva no aparelho e envia quando a conexão volta');
    await A.click('.sucesso .botao--g');
    await A.waitForSelector('.tela--inicio');
    await ctxA.setOffline(true);
    await preencher(A, 77123);
    await A.waitForTimeout(2500);
    const semRede = await situacao(A);
    conferir('A offline: registro guardado e pendente', semRede.pendentes === 1, semRede.rotulo);
    await ctxA.setOffline(false);
    await A.evaluate(() => window.dispatchEvent(new Event('online')));
    await esperarSincronizado(A, 'A ao voltar a internet', 30000);
    await sincronizarAgora(B);
    conferir('B recebe o checklist feito offline', (await linhaB.count()) === 2, `${await linhaB.count()} de teste`);

    console.log('6) Administração exclui; some do aparelho do motorista');
    for (let i = 0; i < 2; i++) {
      await linhaB.first().locator('button').click();
      await B.waitForSelector('.folha');
      await B.click('.folha__rodape .botao:has-text("Excluir checklist")');
      await B.click('.folha__rodape .botao--perigo');
      await B.waitForTimeout(700);
    }
    await esperarSincronizado(B, 'B depois de excluir');
    conferir('B não lista mais os registros de teste', (await linhaB.count()) === 0);
    await A.click('.sucesso .botao--g');
    await A.waitForSelector('.tela--inicio');
    await A.waitForTimeout(600);
    await sincronizarAgora(A);
    const noHistorico = await A.locator('.historico .linha-registro', { hasText: NOME }).count();
    conferir('A não mostra mais os registros excluídos', noHistorico === 0, `${noHistorico} no histórico`);
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 5).join(' | '));
    try {
      await A.screenshot({ path: path.join(SAIDA, 'banco-real-ERRO-A.png') });
      await B.screenshot({ path: path.join(SAIDA, 'banco-real-ERRO-B.png') });
    } catch {
      /* sem captura */
    }
  } finally {
    await browser.close();
    try {
      const removidos = await limparBanco();
      const restantes = (await registrosDeTeste()).length;
      conferir(
        'banco limpo (registros de teste apagados)',
        restantes === 0,
        `${removidos} removido(s), ${restantes} restante(s)`
      );
    } catch (erro) {
      conferir('banco limpo (registros de teste apagados)', false, erro.message);
    }
  }
  conferir('sem erros de console ou de rede', erros.length === 0, [...new Set(erros)].slice(0, 5).join(' | '));
  console.log(`\n${falhas === 0 ? 'TUDO CERTO nos dois aparelhos' : `${falhas} falha(s)`} — capturas em ${SAIDA}`);
  process.exitCode = falhas === 0 ? 0 : 1;
})();
