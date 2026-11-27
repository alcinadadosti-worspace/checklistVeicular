// Teste de navegador: painel da administração com dados semeados (o banco fica BLOQUEADO).
// Confere indicadores, filtros e seletor de período, exportação CSV, ficha, exclusão, a pasta de
// uma unidade, a tela inicial de Palmeira e o botão "voltar" dentro do assistente.
//
// Como rodar (com `npm run build && npm run preview` aberto em outro terminal):
//   CODIGOS_TESTE="palmeira=…,admin=…" node ~/.claude/skills/playwright/run.js tests/e2e/administracao.js
// Variáveis: MODO (desktop | celular; padrão desktop), TARGET_URL (padrão http://localhost:4173),
//            SAIDA (pasta das capturas; padrão: pasta temporária do sistema).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4173';
const SAIDA = process.env.SAIDA || path.join(os.tmpdir(), 'checklist-e2e');
const MODO = process.env.MODO || 'desktop';
const CODIGOS = Object.fromEntries(
  (process.env.CODIGOS_TESTE || '')
    .split(',')
    .map(par => par.trim().split('='))
    .filter(par => par.length === 2)
);
if (!CODIGOS.admin || !CODIGOS.palmeira) {
  console.log('Informe os códigos: CODIGOS_TESTE="palmeira=…,admin=…"');
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

const contextos = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } }
};

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
};
const quantos = texto => Number.parseInt(String(texto || '').replace(/\./g, ''), 10) || 0;

// ~30 checklists das duas unidades nos últimos 18 dias (sequência fixa, sempre os mesmos dados).
const semear = () => {
  const itensBase = ['farois', 'estepe', 'limpador', 'pneusDianteiros', 'pneusTraseiros', 'calotas', 'oleo'];
  const unidades = [
    {
      id: 'penedo',
      nome: 'Penedo',
      veiculo: 'Toyota Hilux Cabine Simples',
      motorista: ['rogerio', 'Rogerio'],
      km: 45210
    },
    {
      id: 'palmeira',
      nome: 'Palmeira dos Índios',
      veiculo: 'Volkswagen Saveiro 2025',
      motorista: ['caique', 'Caique'],
      km: 18840
    }
  ];
  const registros = {};
  let semente = 7;
  const acaso = () => {
    semente = (semente * 1103515245 + 12345) & 0x7fffffff;
    return semente / 0x7fffffff;
  };
  const agora = Date.now();
  for (const unidade of unidades) {
    let km = unidade.km;
    for (let dia = 18; dia >= 0; dia--) {
      if (acaso() < 0.25 && dia !== 0) continue;
      const saida = new Date(agora - dia * 86400000);
      saida.setHours(7, 10 + Math.floor(acaso() * 40), 0, 0);
      if (dia === 0) saida.setTime(agora - 95 * 60000);
      const rodou = 60 + Math.floor(acaso() * 220);
      const emRota = dia === 0 && unidade.id === 'palmeira';
      const itens = Object.fromEntries(
        itensBase.map(id => [id, acaso() < 0.86 ? 'bom' : acaso() < 0.6 ? 'ruim' : 'faltante'])
      );
      const outro = acaso() < 0.2;
      const id = `ck_${saida.getTime().toString(36)}_${unidade.id.slice(0, 3)}${String(dia).padStart(5, '0')}`;
      const retorno = new Date(saida.getTime() + (5 + acaso() * 4) * 3600000);
      registros[id] = {
        id,
        versao: 1,
        unidade: unidade.id,
        unidadeNome: unidade.nome,
        veiculo: unidade.veiculo,
        motoristaId: outro ? 'outro' : unidade.motorista[0],
        motoristaNome: outro ? 'José Aparecido' : unidade.motorista[1],
        kmSaida: km,
        kmVolta: emRota ? null : km + rodou,
        preenchidoEm: saida.toISOString(),
        retornoEm: emRota ? null : retorno.toISOString(),
        itens,
        outros: acaso() < 0.3 ? 'Luz do óleo piscou na subida; conferir nível.' : '',
        excluido: false,
        criadoEm: saida.getTime(),
        atualizadoEm: saida.getTime()
      };
      if (!emRota) km += rodou;
    }
  }
  localStorage.setItem('clv.dados.v1', JSON.stringify({ registros, pendentes: [], cursor: null }));
  return Object.keys(registros).length;
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const contexto = await browser.newContext({ ...contextos[MODO], acceptDownloads: true });
  await contexto.route('**/firestore.googleapis.com/**', rota => rota.abort()); // nunca toca o banco real
  const page = await contexto.newPage();
  const erros = [];
  page.on('console', m => {
    const texto = m.text();
    if (/Failed to load resource|net::ERR_FAILED|matter-js/.test(texto)) return;
    if (m.type() === 'error' || m.type() === 'warning') erros.push(`[${m.type()}] ${texto.slice(0, 300)}`);
  });
  page.on('pageerror', e => erros.push(`[pageerror] ${e.message}`));
  let n = 0;
  const foto = async (nome, opcoes = {}) => {
    n += 1;
    await page.screenshot({
      path: path.join(SAIDA, `admin-${MODO}-${String(n).padStart(2, '0')}-${nome}.png`),
      ...opcoes
    });
    const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: innerWidth }));
    if (largura.doc > largura.janela)
      conferir(`sem rolagem lateral em "${nome}"`, false, `${largura.doc}px > ${largura.janela}px`);
  };
  const digitar = async codigo => {
    await page.waitForSelector('.teclado');
    await page.waitForTimeout(900);
    for (const d of codigo) await page.click(`.tecla:text-is("${d}")`);
  };
  const esperar = (funcao, argumento) =>
    page.waitForFunction(funcao, argumento, { timeout: 6000 }).then(
      () => true,
      () => false
    );

  try {
    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    const semeados = await page.evaluate(semear);
    await page.reload({ waitUntil: 'load' });

    // painel
    await digitar(CODIGOS.admin);
    await page.waitForSelector('.tela--admin', { timeout: 20000 });
    await page.waitForTimeout(6500);
    const indicador = await page.textContent('.indicadores--admin dd');
    conferir(
      'indicador de checklists do período',
      quantos(indicador) === semeados,
      `${quantos(indicador)} de ${semeados}`
    );
    await foto('painel');
    await page.evaluate(() => window.scrollTo(0, 620));
    await page.waitForTimeout(3500);
    await foto('unidades');
    await page.evaluate(() => document.querySelector('.admin__registros').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1500);
    await foto('registros');

    // filtros: atalho, seletor de período pelo teclado, situação e busca
    await page.click('.chip:has-text("7 dias")');
    await page.waitForTimeout(900);
    const em7 = quantos(await page.textContent('.admin__contagem'));
    await page.focus('.mostrador--filtro [role="slider"]');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    const dial = await page.getAttribute('.mostrador--filtro [role="slider"]', 'aria-valuenow');
    const em12 = quantos(await page.textContent('.admin__contagem'));
    conferir('seletor de período responde ao teclado', dial === '12', `${dial} dias`);
    conferir(
      'período maior mostra mais registros',
      em7 > 0 && em7 <= em12 && em12 <= semeados,
      `7 dias: ${em7}, 12 dias: ${em12}`
    );
    await page.click('.chip:has-text("Com apontamentos")');
    await page.waitForTimeout(600);
    const comAlerta = quantos(await page.textContent('.admin__contagem'));
    conferir('filtro "com apontamentos"', comAlerta > 0 && comAlerta < em12, `${comAlerta}`);
    await page.fill('.busca input', 'jose');
    await page.waitForTimeout(600);
    const jose = quantos(await page.textContent('.admin__contagem'));
    conferir('busca sem acento acha "José"', jose > 0, `${jose}`);
    await foto('filtros');
    await page.fill('.busca input', '');
    await page.click('.chip:has-text("Todos")');
    await page.click('.chip:has-text("90 dias")');
    await page.waitForTimeout(600);

    // exportação
    const [arquivo] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.click('.botao:has-text("Exportar planilha")')
    ]);
    const caminho = path.join(SAIDA, 'exportado.csv');
    await arquivo.saveAs(caminho);
    const linhas = fs.readFileSync(caminho, 'utf8').split('\r\n');
    conferir(
      'planilha CSV com cabeçalho + todos os registros',
      linhas.length === semeados + 1,
      `${linhas.length} linhas`
    );

    // ficha + exclusão
    const antes = await page.locator('.lista-registros--admin .linha-registro').count();
    await page.locator('.lista-registros--admin .linha-registro button').first().click();
    await page.waitForSelector('.folha');
    await page.waitForTimeout(700);
    await foto('detalhe');
    await page.click('.folha__rodape .botao:has-text("Excluir checklist")');
    await page.waitForTimeout(300);
    await foto('confirmar-exclusao');
    await page.click('.folha__rodape .botao--perigo');
    await page.waitForTimeout(800);
    const depois = await page.locator('.lista-registros--admin .linha-registro').count();
    conferir('exclusão tira o registro da lista', depois === antes - 1, `${antes} -> ${depois}`);

    // pasta de uma unidade: abre e toca num bilhete
    await page.evaluate(() => document.querySelector('.admin__unidades').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(800);
    await page.locator('.unidade .folder-float__trigger').first().click();
    await page.waitForTimeout(1800);
    await foto('pasta-unidade');
    await page.locator('.unidade .folder-float__item').first().click();
    await page.waitForTimeout(900);
    conferir('bilhete da pasta abre a ficha', (await page.locator('.folha').count()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // sair e entrar em Palmeira
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('.topo .botao-icone[aria-label="Sair"]');
    await digitar(CODIGOS.palmeira);
    await page.waitForSelector('.tela--motorista', { timeout: 20000 });
    await page.click('.cracha-escolha__botao[aria-label="Entrar como Caique"]');
    await page.waitForSelector('.tela--inicio', { timeout: 20000 });
    await page.waitForTimeout(6000);
    conferir('tela inicial de Palmeira', (await page.textContent('.topo__textos strong')) === 'Palmeira dos Índios');
    await foto('palmeira-inicio');
    await page.evaluate(() => document.querySelector('.historico').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.locator('.historico .linha-registro button').first().click({ timeout: 8000 });
    await page.waitForSelector('.folha');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // botão "voltar" do navegador dentro do assistente
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('.inicio__acoes .botao');
    await page.waitForSelector('.tela--checklist');
    await page.waitForSelector('.campo-km');
    await page.locator('.campo-km__entrada').first().fill('1000');
    await page.click('.assistente__rodape .botao--g');
    await page.waitForSelector('.itens');
    await page.goBack();
    conferir(
      'voltar no passo 2 leva ao passo 1',
      await esperar(() => document.querySelectorAll('.campo-km').length === 1)
    );
    await page.goBack();
    conferir(
      'voltar no passo 1 leva ao início',
      await esperar(() => {
        const telas = document.querySelectorAll('main.tela');
        return telas.length === 1 && telas[0].classList.contains('tela--inicio');
      })
    );
  } catch (erro) {
    falhas += 1;
    console.log(' ERRO:', erro.message.split('\n').slice(0, 6).join(' | '));
    try {
      await page.screenshot({ path: path.join(SAIDA, `admin-${MODO}-ERRO.png`) });
    } catch {
      /* sem captura */
    }
  }
  conferir('sem erros no console', erros.length === 0, erros.slice(0, 5).join(' | '));
  console.log(`\n${falhas === 0 ? 'TUDO CERTO' : `${falhas} falha(s)`} — capturas em ${SAIDA}`);
  await browser.close();
  process.exitCode = falhas === 0 ? 0 : 1;
})();
