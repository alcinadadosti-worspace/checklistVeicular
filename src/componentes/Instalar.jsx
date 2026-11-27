import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { instalar, useInstalacao } from '../lib/instalacao.js';
import Icone from './Icone.jsx';

/**
 * "Instalar o app": no Android, um toque abre a janela de instalação do navegador; no iPhone/iPad,
 * mostra como adicionar pela opção Compartilhar do Safari. Some quando o app já está instalado.
 */
export default function Instalar({ className = '' }) {
  const modo = useInstalacao();
  const [dica, setDica] = useState(false);

  if (modo === 'botao') {
    return (
      <button type="button" className={`atalho instalar${className ? ` ${className}` : ''}`} onClick={instalar}>
        <Icone nome="celular" tamanho={16} />
        Instalar o app neste aparelho
      </button>
    );
  }

  if (modo !== 'ios') return null;
  return (
    <div className={`instalar instalar--ios${className ? ` ${className}` : ''}`}>
      <button type="button" className="atalho" aria-expanded={dica} onClick={() => setDica(aberta => !aberta)}>
        <Icone nome="celular" tamanho={16} />
        Instalar no iPhone ou iPad
      </button>
      <AnimatePresence initial={false}>
        {dica ? (
          <motion.p
            className="instalar__dica"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
          >
            No Safari, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima) e depois em{' '}
            <strong>Adicionar à Tela de Início</strong>. O app passa a abrir pelo ícone, em tela cheia.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
