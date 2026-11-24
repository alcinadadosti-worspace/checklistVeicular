// Fotos dos crachás. Os arquivos de src/assets/fotos são gerados a partir da pasta img/
// (veja scripts/preparar-fotos.mjs); a chave é o nome do arquivo, sem extensão.

const arquivos = import.meta.glob('../assets/fotos/*.webp', { eager: true, import: 'default', query: '?url' });

const FOTOS = Object.fromEntries(
  Object.entries(arquivos).map(([caminho, url]) => [
    caminho
      .split('/')
      .pop()
      .replace(/\.webp$/, ''),
    url
  ])
);

/** URL da foto de uma pessoa (ou null, e o crachá mostra a silhueta). */
export const fotoDe = chave => (chave && FOTOS[chave]) || null;
