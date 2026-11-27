// Gera os ícones do app instalado (tela inicial do celular/tablet) a partir de public/favicon.svg.
// Uso: npm run icones
//
//  - icone-192.png / icone-512.png: Android e computador (cantos arredondados do próprio desenho).
//  - icone-adaptavel-512.png: Android "maskable" — fundo até a borda e o volante dentro da zona
//    segura (o sistema recorta em círculo, gota etc.).
//  - apple-touch-icon.png (180): iPhone/iPad — fundo até a borda; o iOS arredonda sozinho.

import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const FUNDO = '#0b1220'; // mesma cor do fundo do favicon.svg
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url));
const pasta = new URL('../public/icones/', import.meta.url);
mkdirSync(pasta, { recursive: true });

const desenho = lado =>
  sharp(svg, { density: 72 * Math.ceil(lado / 64) * 2 })
    .resize(lado, lado)
    .png()
    .toBuffer();

/** Ícone com fundo até a borda e o desenho ocupando `proporcao` do lado. */
const cheio = async (lado, proporcao) => {
  const interno = Math.round(lado * proporcao);
  return sharp({ create: { width: lado, height: lado, channels: 4, background: FUNDO } })
    .composite([{ input: await desenho(interno), gravity: 'center' }])
    .png()
    .toBuffer();
};

const arquivos = {
  'icone-192.png': await desenho(192),
  'icone-512.png': await desenho(512),
  'icone-adaptavel-512.png': await cheio(512, 0.78),
  'apple-touch-icon.png': await cheio(180, 0.92)
};

for (const [nome, conteudo] of Object.entries(arquivos)) {
  await sharp(conteudo)
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(new URL(nome, pasta)));
  console.log(`public/icones/${nome}`);
}
