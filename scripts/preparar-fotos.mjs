// Prepara as fotos dos crachás.
//
// Lê tudo o que estiver na pasta `img/` (jpg, jpeg, png, webp) e grava uma versão
// leve (WebP, no máximo 640 px) em `src/assets/fotos/<nome>.webp`. O nome do arquivo
// vira a "chave" da foto: `Rogerio.png` -> `rogerio`, `caique.jpg` -> `caique`.
//
// Roda sozinho antes de `npm run dev` e `npm run build`. Só refaz o que mudou;
// use `npm run fotos` para refazer tudo. Se a biblioteca de imagem não estiver
// disponível, o script avisa e segue em frente com as fotos já geradas.

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = join(RAIZ, 'img');
const DESTINO = join(RAIZ, 'src', 'assets', 'fotos');
const LADO_MAXIMO = 640;
const EXTENSOES = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const forcar = process.argv.includes('--forcar');

export const chaveDaFoto = nome =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const principal = async () => {
  if (!existsSync(ORIGEM)) {
    console.log('[fotos] pasta img/ não encontrada — nada a fazer.');
    return;
  }
  const arquivos = readdirSync(ORIGEM).filter(nome => EXTENSOES.has(extname(nome).toLowerCase()));
  if (arquivos.length === 0) {
    console.log('[fotos] nenhuma foto em img/.');
    return;
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('[fotos] biblioteca "sharp" indisponível — mantendo as fotos já geradas em src/assets/fotos.');
    return;
  }

  mkdirSync(DESTINO, { recursive: true });
  for (const arquivo of arquivos) {
    const chave = chaveDaFoto(basename(arquivo, extname(arquivo)));
    if (!chave) continue;
    const entrada = join(ORIGEM, arquivo);
    const saida = join(DESTINO, `${chave}.webp`);
    if (!forcar && existsSync(saida) && statSync(saida).mtimeMs >= statSync(entrada).mtimeMs) continue;
    try {
      const info = await sharp(entrada)
        .rotate()
        .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(saida);
      console.log(
        `[fotos] ${arquivo} -> src/assets/fotos/${chave}.webp (${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB)`
      );
    } catch (erro) {
      console.warn(`[fotos] não consegui converter ${arquivo}: ${erro.message}`);
    }
  }
};

principal().catch(erro => {
  console.warn(`[fotos] aviso: ${erro.message}`);
});
