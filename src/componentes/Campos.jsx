import { useId } from 'react';
import { motion } from 'motion/react';
import { SITUACOES, situacaoPorId } from '../config/frota.js';
import { data, horaComSegundos, paraKm, soDigitos } from '../lib/formato.js';
import { useAgora } from '../lib/ganchos.js';
import { iconeDaSituacao } from './Basicos.jsx';
import Icone from './Icone.jsx';

const DIGITOS = '0123456789'.split('');

/** Odômetro: cada casa é uma fita de 0 a 9 que rola até o dígito. */
export function Odometro({ valor, casas = 6 }) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const digitos = texto.padStart(Math.max(casas, texto.length), '0').split('');
  const zeros = digitos.length - texto.length;
  return (
    <span className="odometro" aria-hidden="true" data-vazio={texto === '' ? '' : undefined}>
      {digitos.map((digito, indice) => (
        <span
          className="odometro__casa"
          key={digitos.length - indice}
          data-apagado={indice < zeros ? '' : undefined}
          data-milhar={(digitos.length - indice) % 3 === 0 && indice > 0 ? '' : undefined}
        >
          <span className="odometro__fita" style={{ transform: `translateY(${-Number(digito) * 10}%)` }}>
            {DIGITOS.map(n => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Campo de quilometragem: o visor é um odômetro; toque nele para digitar. */
export function CampoKm({ rotulo, valor, aoMudar, erro, dica, opcional = false, autoFocus = false, casas = 6 }) {
  const id = useId();
  const paraOFim = evento => {
    const campo = evento.currentTarget;
    const fim = campo.value.length;
    requestAnimationFrame(() => {
      try {
        campo.setSelectionRange(fim, fim);
      } catch {
        /* alguns teclados não permitem mover o cursor: tudo bem */
      }
    });
  };
  return (
    <div className="campo-km" data-erro={erro ? '' : undefined} data-preenchido={valor ? '' : undefined}>
      <label className="rotulo" htmlFor={id}>
        {rotulo}
        {opcional ? <em>opcional</em> : null}
      </label>
      <div className="campo-km__visor">
        <Odometro valor={paraKm(valor)} casas={casas} />
        <span className="campo-km__unidade">km</span>
        <input
          id={id}
          className="campo-km__entrada"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={7}
          value={valor}
          autoFocus={autoFocus}
          aria-invalid={erro ? true : undefined}
          aria-describedby={`${id}-ajuda`}
          onChange={evento => aoMudar(soDigitos(evento.target.value))}
          onFocus={paraOFim}
          onClick={paraOFim}
          onKeyDown={evento => {
            if (evento.key === 'Enter') evento.currentTarget.blur();
          }}
        />
        <span className="campo-km__toque" aria-hidden="true">
          <Icone nome="lapis" tamanho={15} /> toque para digitar
        </span>
      </div>
      <p id={`${id}-ajuda`} className={erro ? 'campo__erro' : 'campo__dica'} role={erro ? 'alert' : undefined}>
        {erro || dica || ' '}
      </p>
    </div>
  );
}

/** Data e hora "ao vivo": é o carimbo que o app grava sozinho ao enviar. */
export function CarimboDeHora({
  rotulo = 'Data e hora do preenchimento',
  nota = 'Registradas automaticamente pelo app'
}) {
  const agora = useAgora(1000);
  return (
    <div className="carimbo">
      <span className="carimbo__icone">
        <Icone nome="relogio" tamanho={22} />
      </span>
      <div>
        <span className="rotulo">{rotulo}</span>
        <strong className="mono">
          {data(agora)} <i>·</i> {horaComSegundos(agora)}
        </strong>
        <small>{nota}</small>
      </div>
    </div>
  );
}

/** Um item do checklist com os três botões: Bom, Ruim, Faltante / Não funciona. */
export function ItemInspecao({ item, valor, aoMudar, indice = 0, cobrar = false }) {
  const situacao = situacaoPorId(valor);
  return (
    <motion.li
      className="item"
      data-situacao={valor || undefined}
      data-cobrar={cobrar && !valor ? '' : undefined}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.04 * indice, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="item__cabeca">
        <span className="item__icone">
          <Icone nome={item.icone} tamanho={22} />
        </span>
        <span className="item__nome" id={`item-${item.id}`}>
          {item.nome}
        </span>
        <span className="item__estado">{situacao ? situacao.curto : 'pendente'}</span>
      </div>
      <div className="item__opcoes" role="radiogroup" aria-labelledby={`item-${item.id}`}>
        {SITUACOES.map(opcao => {
          const ativa = valor === opcao.id;
          return (
            <motion.button
              key={opcao.id}
              type="button"
              role="radio"
              aria-checked={ativa}
              className="opcao"
              data-tipo={opcao.id}
              data-ativa={ativa ? '' : undefined}
              whileTap={{ scale: 0.95 }}
              onClick={() => aoMudar(opcao.id)}
            >
              <Icone nome={iconeDaSituacao(opcao.id)} tamanho={17} espessura={2.4} />
              <span>{opcao.nome}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.li>
  );
}
