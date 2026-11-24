import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Funcionamento offline: no build, gera dist/sw.js a partir de scripts/sw-modelo.js,
// preenchendo a versão do cache e a lista de arquivos do app (JS, CSS, fotos e fontes).
// Depois da primeira visita o app abre mesmo sem internet.
const servicoOffline = () => ({
  name: 'servico-offline',
  apply: 'build',
  generateBundle(_opcoes, pacote) {
    const arquivos = Object.keys(pacote)
      .filter(nome => /\.(js|css|webp|png|jpg|svg)$/.test(nome) || /-latin(-ext)?-.*\.woff2$/.test(nome))
      .map(nome => `/${nome}`)
      .sort();
    const modelo = readFileSync(new URL('./scripts/sw-modelo.js', import.meta.url), 'utf8');
    const codigo = modelo
      .replace('__VERSAO__', String(Date.now()))
      .replace('/*__ARQUIVOS__*/ []', JSON.stringify(arquivos));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo });
  }
});

// Site 100% estático: "npm run build" gera a pasta dist/, que é o que o Render publica.
export default defineConfig({
  plugins: [react(), servicoOffline()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500
  }
});
