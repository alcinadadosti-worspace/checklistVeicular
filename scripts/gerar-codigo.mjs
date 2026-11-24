// Gera o "hash" de um código de acesso, para colar em src/config/frota.js.
//
//   npm run codigo -- 12345
//
// Os códigos não ficam escritos no site: só o hash deles. Para trocar o código de uma
// unidade (ou do admin), rode este comando com o código novo e substitua o `codigoHash`
// correspondente em src/config/frota.js.

import { hashDoCodigo } from '../src/lib/hash.js';

const codigos = process.argv.slice(2).filter(Boolean);
if (codigos.length === 0) {
  console.log('Uso: npm run codigo -- <código> [outro código...]');
  process.exit(1);
}
for (const codigo of codigos) {
  if (!/^\d{4,8}$/.test(codigo)) {
    console.log(`"${codigo}": use de 4 a 8 dígitos (o teclado do app só tem números).`);
    continue;
  }
  console.log(`${codigo} -> ${hashDoCodigo(codigo)}`);
}
