// Desenha as artes do crachá (frente, verso e cordão) num <canvas>.
// O componente Lanyard do React Bits recebe essas imagens e as aplica no crachá 3D.

const LARGURA = 1024;
const ALTURA = 1440; // mesma proporção do cartão do Lanyard (1,6 × 2,25)

export const TEMAS = {
  azul: { a: '#38bdf8', b: '#6366f1', claro: '#bae6fd', cordao: '#0b1626' },
  violeta: { a: '#c084fc', b: '#f472b6', claro: '#f0d9ff', cordao: '#170f26' }
};

const FONTE = '"Sora Variable", "Sora", system-ui, sans-serif';
const FONTE_MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';

const imagens = new Map();
const carregarImagem = url => {
  if (!url) return Promise.resolve(null);
  if (!imagens.has(url)) {
    imagens.set(
      url,
      new Promise(resolver => {
        const imagem = new Image();
        imagem.decoding = 'async';
        imagem.onload = () => resolver(imagem);
        imagem.onerror = () => resolver(null);
        imagem.src = url;
      })
    );
  }
  return imagens.get(url);
};

let fontesProntas = null;
const prepararFontes = () => {
  if (!fontesProntas) {
    const pedidos = [`800 96px ${FONTE}`, `500 40px ${FONTE}`, `600 28px ${FONTE_MONO}`].map(fonte =>
      document.fonts?.load ? document.fonts.load(fonte).catch(() => null) : null
    );
    // Não espera mais que 1,5 s: se a fonte não chegar, desenha com a do sistema.
    fontesProntas = Promise.race([Promise.all(pedidos), new Promise(resolver => setTimeout(resolver, 1500))]);
  }
  return fontesProntas;
};

const retanguloArredondado = (ctx, x, y, largura, altura, raio) => {
  const r = Math.min(raio, largura / 2, altura / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, r);
  ctx.arcTo(x + largura, y + altura, x, y + altura, r);
  ctx.arcTo(x, y + altura, x, y, r);
  ctx.arcTo(x, y, x + largura, y, r);
  ctx.closePath();
};

const gradiente = (ctx, x0, y0, x1, y1, cores) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  cores.forEach((cor, i) => g.addColorStop(cores.length === 1 ? 0 : i / (cores.length - 1), cor));
  return g;
};

// Escreve com espaçamento entre letras (compatível com navegadores sem ctx.letterSpacing).
const escreverEspacado = (ctx, texto, x, y, espaco, alinhamento = 'left') => {
  const letras = [...texto];
  const larguras = letras.map(letra => ctx.measureText(letra).width);
  const total = larguras.reduce((soma, valor) => soma + valor, 0) + espaco * (letras.length - 1);
  let cursor = alinhamento === 'center' ? x - total / 2 : alinhamento === 'right' ? x - total : x;
  const anterior = ctx.textAlign;
  ctx.textAlign = 'left';
  letras.forEach((letra, i) => {
    ctx.fillText(letra, cursor, y);
    cursor += larguras[i] + espaco;
  });
  ctx.textAlign = anterior;
  return total;
};

// Diminui a fonte até o texto caber na largura.
const ajustarFonte = (ctx, texto, peso, tamanho, larguraMaxima, minimo = 40) => {
  let corpo = tamanho;
  do {
    ctx.font = `${peso} ${corpo}px ${FONTE}`;
    if (ctx.measureText(texto).width <= larguraMaxima) break;
    corpo -= 4;
  } while (corpo > minimo);
  return corpo;
};

const sementeDe = texto => {
  let h = 2166136261;
  for (const letra of String(texto)) {
    h ^= letra.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const codigoDeBarras = (ctx, x, y, largura, altura, texto, cor) => {
  let estado = sementeDe(texto) || 1;
  const proximo = () => {
    estado ^= estado << 13;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    return (estado >>> 0) / 4294967296;
  };
  ctx.fillStyle = cor;
  let cursor = x;
  while (cursor < x + largura - 4) {
    const barra = 3 + Math.floor(proximo() * 3) * 3;
    const vao = 3 + Math.floor(proximo() * 3) * 3;
    ctx.fillRect(cursor, y, Math.min(barra, x + largura - cursor), altura);
    cursor += barra + vao;
  }
};

const fundo = (ctx, tema) => {
  ctx.fillStyle = gradiente(ctx, 0, 0, 0, ALTURA, ['#131c2c', '#0b111c', '#080c14']);
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  // textura de linhas diagonais bem discretas
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (let x = -ALTURA; x < LARGURA; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, ALTURA);
    ctx.lineTo(x + ALTURA, 0);
    ctx.stroke();
  }
  ctx.restore();
  // brilho de canto
  const brilho = ctx.createRadialGradient(LARGURA * 0.85, 120, 0, LARGURA * 0.85, 120, 720);
  brilho.addColorStop(0, `${tema.b}55`);
  brilho.addColorStop(1, `${tema.b}00`);
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
};

const faixaSuperior = (ctx, tema) => {
  // faixa colorida onde fica o furo do cordão
  ctx.fillStyle = gradiente(ctx, 0, 0, LARGURA, 0, [tema.a, tema.b]);
  ctx.fillRect(0, 0, LARGURA, 150);
  ctx.fillStyle = 'rgba(5, 8, 14, 0.18)';
  ctx.fillRect(0, 130, LARGURA, 20);
};

const silhueta = (ctx, x, y, lado) => {
  ctx.fillStyle = gradiente(ctx, x, y, x, y + lado, ['#243044', '#141c2b']);
  ctx.fillRect(x, y, lado, lado);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.34)';
  ctx.beginPath();
  ctx.arc(x + lado / 2, y + lado * 0.39, lado * 0.185, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + lado * 0.12, y + lado);
  ctx.bezierCurveTo(x + lado * 0.12, y + lado * 0.72, x + lado * 0.3, y + lado * 0.64, x + lado / 2, y + lado * 0.64);
  ctx.bezierCurveTo(x + lado * 0.7, y + lado * 0.64, x + lado * 0.88, y + lado * 0.72, x + lado * 0.88, y + lado);
  ctx.closePath();
  ctx.fill();
};

const volante = (ctx, cx, cy, raio, cor, espessura) => {
  ctx.save();
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineWidth = espessura;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, raio * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - raio * 0.92, cy - raio * 0.14);
  ctx.lineTo(cx - raio * 0.3, cy - raio * 0.14);
  ctx.moveTo(cx + raio * 0.3, cy - raio * 0.14);
  ctx.lineTo(cx + raio * 0.92, cy - raio * 0.14);
  ctx.moveTo(cx, cy + raio * 0.3);
  ctx.lineTo(cx, cy + raio * 0.94);
  ctx.stroke();
  ctx.restore();
};

const novaTela = () => {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  return canvas;
};

/**
 * Frente do crachá: foto (ou silhueta), nome, função, unidade e veículo.
 * `foco` = ponto da foto que fica no centro; `zoom` aproxima.
 */
export async function desenharFrente({
  nome,
  cargo,
  unidade,
  veiculo,
  fotoUrl,
  foco = [0.5, 0.45],
  zoom = 1,
  tema = 'azul'
}) {
  const cores = TEMAS[tema] || TEMAS.azul;
  const [foto] = await Promise.all([carregarImagem(fotoUrl), prepararFontes()]);
  const canvas = novaTela();
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  fundo(ctx, cores);
  faixaSuperior(ctx, cores);

  // marca
  ctx.textBaseline = 'alphabetic';
  volante(ctx, 106, 222, 26, cores.claro, 7);
  ctx.fillStyle = '#e8eef7';
  ctx.font = `700 31px ${FONTE}`;
  escreverEspacado(ctx, 'CHECKLIST VEICULAR', 152, 233, 4.5);

  // foto
  const lado = 620;
  const fx = (LARGURA - lado) / 2;
  const fy = 290;
  ctx.save();
  ctx.shadowColor = `${cores.a}66`;
  ctx.shadowBlur = 60;
  retanguloArredondado(ctx, fx - 9, fy - 9, lado + 18, lado + 18, 74);
  ctx.fillStyle = gradiente(ctx, fx, fy, fx + lado, fy + lado, [cores.a, cores.b]);
  ctx.fill();
  ctx.restore();

  ctx.save();
  retanguloArredondado(ctx, fx, fy, lado, lado, 66);
  ctx.clip();
  if (foto) {
    const escala = (lado / Math.min(foto.width, foto.height)) * Math.max(1, zoom);
    const largura = foto.width * escala;
    const altura = foto.height * escala;
    // mantém o ponto de foco no centro, sem deixar a foto "descobrir" as bordas
    const dx = Math.min(0, Math.max(lado - largura, lado / 2 - foco[0] * largura));
    const dy = Math.min(0, Math.max(lado - altura, lado / 2 - foco[1] * altura));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(foto, fx + dx, fy + dy, largura, altura);
  } else {
    silhueta(ctx, fx, fy, lado);
  }
  // leve escurecida na base da foto, para o nome respirar
  ctx.fillStyle = gradiente(ctx, 0, fy + lado * 0.7, 0, fy + lado, ['rgba(8,12,20,0)', 'rgba(8,12,20,0.35)']);
  ctx.fillRect(fx, fy + lado * 0.7, lado, lado * 0.3);
  ctx.restore();

  // nome e função
  const nomeExibido = (nome || 'Motorista').toUpperCase();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  const corpo = ajustarFonte(ctx, nomeExibido, 800, 104, LARGURA - 150, 46);
  ctx.fillText(nomeExibido, LARGURA / 2, 1026 + (corpo < 80 ? -8 : 0));
  ctx.fillStyle = cores.claro;
  ctx.font = `600 36px ${FONTE}`;
  escreverEspacado(ctx, (cargo || 'Motorista').toUpperCase(), LARGURA / 2, 1090, 9, 'center');

  // divisória
  ctx.fillStyle = gradiente(ctx, 110, 0, LARGURA - 110, 0, [
    `${cores.a}00`,
    `${cores.a}cc`,
    `${cores.b}cc`,
    `${cores.b}00`
  ]);
  ctx.fillRect(110, 1134, LARGURA - 220, 3);

  // unidade e veículo
  const coluna = (rotulo, valor, x, larguraMaxima) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8b9ab3';
    ctx.font = `600 24px ${FONTE}`;
    escreverEspacado(ctx, rotulo, x, 1190, 5);
    ctx.fillStyle = '#f1f5f9';
    ajustarFonte(ctx, valor, 700, 40, larguraMaxima, 26);
    ctx.fillText(valor, x, 1242);
  };
  coluna('UNIDADE', unidade || '—', 110, 400);
  coluna('VEÍCULO', veiculo || '—', 540, 380);

  // código de barras decorativo
  codigoDeBarras(ctx, 110, 1300, LARGURA - 220, 62, `${nome}|${unidade}`, 'rgba(226, 232, 240, 0.82)');
  ctx.fillStyle = '#64748b';
  ctx.font = `600 22px ${FONTE_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText('ROTA SEGURA COMEÇA NO CHECKLIST', LARGURA / 2, 1398);

  return canvas.toDataURL('image/jpeg', 0.92);
}

/** Verso do crachá. */
export async function desenharVerso({ unidade, veiculo, tema = 'azul' }) {
  const cores = TEMAS[tema] || TEMAS.azul;
  await prepararFontes();
  const canvas = novaTela();
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  fundo(ctx, cores);
  faixaSuperior(ctx, cores);

  volante(ctx, LARGURA / 2, 560, 190, cores.a, 34);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 92px ${FONTE}`;
  ctx.fillText('CHECKLIST', LARGURA / 2, 900);
  ctx.fillStyle = cores.claro;
  ctx.font = `800 92px ${FONTE}`;
  ctx.fillText('VEICULAR', LARGURA / 2, 1000);

  ctx.fillStyle = gradiente(ctx, 180, 0, LARGURA - 180, 0, [
    `${cores.a}00`,
    `${cores.a}cc`,
    `${cores.b}cc`,
    `${cores.b}00`
  ]);
  ctx.fillRect(180, 1060, LARGURA - 360, 3);

  ctx.fillStyle = '#cbd5e1';
  ajustarFonte(ctx, unidade || '', 700, 44, LARGURA - 200, 28);
  ctx.fillText(unidade || '', LARGURA / 2, 1150);
  ctx.fillStyle = '#8b9ab3';
  ajustarFonte(ctx, veiculo || '', 500, 36, LARGURA - 200, 24);
  ctx.fillText(veiculo || '', LARGURA / 2, 1206);

  ctx.fillStyle = '#64748b';
  ctx.font = `600 24px ${FONTE_MONO}`;
  ctx.fillText('CONFERIU? ENTÃO BOA ROTA.', LARGURA / 2, 1370);

  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Estampa do cordão (repetida ao longo da fita). */
export async function desenharCordao({ texto = 'CHECKLIST VEICULAR', tema = 'azul' }) {
  const cores = TEMAS[tema] || TEMAS.azul;
  await prepararFontes();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const altura = 128;
  ctx.font = `800 54px ${FONTE}`;
  const frase = `${texto.toUpperCase()}  •  `;
  const largura = Math.ceil(ctx.measureText(frase).width + (frase.length - 1) * 5);
  canvas.width = Math.max(256, largura);
  canvas.height = altura;

  ctx.fillStyle = cores.cordao;
  ctx.fillRect(0, 0, canvas.width, altura);
  ctx.fillStyle = gradiente(ctx, 0, 0, canvas.width, 0, [cores.a, cores.b, cores.a]);
  ctx.fillRect(0, 0, canvas.width, 9);
  ctx.fillRect(0, altura - 9, canvas.width, 9);
  ctx.font = `800 54px ${FONTE}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cores.claro;
  escreverEspacado(ctx, frase, 0, altura / 2 + 3, 5);
  return canvas.toDataURL('image/png');
}
