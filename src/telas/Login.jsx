import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { transicaoDeTela } from '../componentes/Basicos.jsx';
import { FundoFibras } from '../componentes/Fundos.jsx';
import Icone from '../componentes/Icone.jsx';
import Instalar from '../componentes/Instalar.jsx';
import { UNIDADES } from '../config/frota.js';
import { CODIGO_MAXIMO, CODIGO_MINIMO, identificar } from '../lib/acesso.js';
import { useAgora } from '../lib/ganchos.js';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'apagar', '0', 'entrar'];
const MAXIMO_DE_ERROS = 5;
const ESPERA_APOS_ERROS = 30000;

export default function Login({ aoEntrar }) {
  const [codigo, setCodigo] = useState('');
  const [fase, setFase] = useState('digitando'); // 'digitando' | 'erro' | 'ok'
  const [liberaEm, setLiberaEm] = useState(0);
  // Espelhos em ref: as teclas podem chegar mais rápido do que o React redesenha.
  const atual = useRef({ codigo: '', fase: 'digitando', travado: false });
  const erros = useRef(0);
  const relogios = useRef([]);
  const agora = useAgora(liberaEm ? 500 : 60000);
  const espera = Math.max(0, Math.ceil((liberaEm - agora.getTime()) / 1000));
  const travado = espera > 0;
  atual.current.travado = travado;

  const mudarCodigo = valor => {
    atual.current.codigo = valor;
    setCodigo(valor);
  };
  const mudarFase = valor => {
    atual.current.fase = valor;
    setFase(valor);
  };

  useEffect(() => () => relogios.current.forEach(clearTimeout), []);

  const conferir = useCallback(
    (texto, forcar) => {
      const depois = (funcao, ms) => relogios.current.push(setTimeout(funcao, ms));
      const sessao = identificar(texto);
      if (sessao) {
        mudarFase('ok');
        depois(() => aoEntrar(sessao), 700);
        return;
      }
      if (!forcar && texto.length < CODIGO_MAXIMO) return;
      erros.current += 1;
      mudarFase('erro');
      navigator.vibrate?.(140);
      depois(() => {
        mudarCodigo('');
        mudarFase('digitando');
        if (erros.current >= MAXIMO_DE_ERROS) {
          erros.current = 0;
          setLiberaEm(Date.now() + ESPERA_APOS_ERROS);
        }
      }, 620);
    },
    [aoEntrar]
  );

  const tocar = useCallback(
    tecla => {
      const { codigo: digitado, fase: faseAtual, travado: emEspera } = atual.current;
      if (faseAtual !== 'digitando' || emEspera) return;
      if (tecla === 'apagar') {
        mudarCodigo(digitado.slice(0, -1));
        return;
      }
      if (tecla === 'entrar') {
        if (digitado.length > 0) conferir(digitado, true);
        return;
      }
      if (digitado.length >= CODIGO_MAXIMO) return;
      const novo = digitado + tecla;
      mudarCodigo(novo);
      if (novo.length >= CODIGO_MINIMO) conferir(novo, false);
    },
    [conferir]
  );

  // Teclado físico e colar (para quem acessa pelo computador).
  useEffect(() => {
    const aoTeclar = evento => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (/^\d$/.test(evento.key)) tocar(evento.key);
      else if (evento.key === 'Backspace') tocar('apagar');
      else if (evento.key === 'Enter') tocar('entrar');
      else if (evento.key === 'Escape' && atual.current.fase === 'digitando') mudarCodigo('');
    };
    const aoColar = evento => {
      const texto = (evento.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, CODIGO_MAXIMO);
      if (!texto || atual.current.fase !== 'digitando' || atual.current.travado) return;
      evento.preventDefault();
      mudarCodigo(texto);
      if (texto.length >= CODIGO_MINIMO) conferir(texto, false);
    };
    window.addEventListener('keydown', aoTeclar);
    window.addEventListener('paste', aoColar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('paste', aoColar);
    };
  }, [conferir, tocar]);

  const mensagem = travado
    ? `Muitas tentativas. Aguarde ${espera} s para tentar de novo.`
    : fase === 'erro'
      ? 'Código não reconhecido.'
      : fase === 'ok'
        ? 'Acesso liberado!'
        : 'Digite o código da sua unidade';

  return (
    <motion.main className="tela tela--login" {...transicaoDeTela}>
      <div className="login__fundo" aria-hidden="true">
        <FundoFibras />
      </div>
      <div className="login__veu" aria-hidden="true" />

      <div className="login">
        <motion.div
          className="login__marca"
          initial={{ scale: 0.6, rotate: -90, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.1 }}
        >
          <Icone nome="volante" tamanho={44} espessura={1.9} />
        </motion.div>
        <motion.h1
          className="login__titulo"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5 }}
        >
          Checklist <span className="degrade">Veicular</span>
        </motion.h1>
        <p className="login__mensagem" data-fase={travado ? 'erro' : fase} role="status" aria-live="polite">
          {mensagem}
        </p>

        <motion.div
          className="login__casas"
          data-fase={fase}
          aria-label={`${codigo.length} dígitos digitados`}
          animate={fase === 'erro' ? { x: [0, -12, 11, -9, 7, -4, 0] } : { x: 0 }}
          transition={{ duration: 0.45 }}
        >
          {Array.from({ length: CODIGO_MAXIMO }, (_, i) => (
            <span key={i} className="login__casa" data-cheia={i < codigo.length ? '' : undefined}>
              <i />
            </span>
          ))}
        </motion.div>

        <motion.div
          className="teclado"
          data-travado={travado || fase !== 'digitando' ? '' : undefined}
          initial="oculto"
          animate="visivel"
          variants={{ visivel: { transition: { staggerChildren: 0.025, delayChildren: 0.25 } } }}
        >
          {TECLAS.map(tecla => (
            <motion.button
              key={tecla}
              type="button"
              className="tecla"
              data-acao={tecla.length > 1 ? tecla : undefined}
              aria-label={tecla === 'apagar' ? 'Apagar' : tecla === 'entrar' ? 'Entrar' : tecla}
              disabled={travado}
              variants={{ oculto: { opacity: 0, y: 14, scale: 0.9 }, visivel: { opacity: 1, y: 0, scale: 1 } }}
              whileTap={{ scale: 0.9 }}
              onClick={() => tocar(tecla)}
            >
              {tecla === 'apagar' ? (
                <Icone nome="apagar" tamanho={24} />
              ) : tecla === 'entrar' ? (
                <Icone nome="seta-direita" tamanho={26} espessura={2.2} />
              ) : (
                tecla
              )}
            </motion.button>
          ))}
        </motion.div>

        <p className="login__rodape">
          <Icone nome="rota" tamanho={15} />
          {UNIDADES.map(unidade => unidade.nome).join(' · ')}
        </p>
        <Instalar />
      </div>
    </motion.main>
  );
}
