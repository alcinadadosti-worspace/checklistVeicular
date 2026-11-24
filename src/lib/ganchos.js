import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { banco } from './banco.js';
import { sincronizacao } from './sincronizacao.js';

/** Registros deste aparelho (já juntos com os da nuvem), sempre atualizados. */
export const useBanco = () => useSyncExternalStore(banco.assinar, banco.obter, banco.obter);

/** Situação da sincronização com a nuvem. */
export const useSincronizacao = () =>
  useSyncExternalStore(sincronizacao.assinar, sincronizacao.obter, sincronizacao.obter);

/** Data/hora atual, atualizada a cada `intervalo` ms (relógio vivo). */
export function useAgora(intervalo = 1000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), intervalo);
    return () => clearInterval(relogio);
  }, [intervalo]);
  return agora;
}

/** [ref, jaApareceu]: vira true quando o elemento chega perto da tela (e fica true). */
export function useNaTela(margem = '240px') {
  const ref = useRef(null);
  const [apareceu, setApareceu] = useState(false);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || apareceu) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setApareceu(true);
      return undefined;
    }
    const observador = new IntersectionObserver(
      entradas => {
        if (entradas.some(entrada => entrada.isIntersecting)) {
          setApareceu(true);
          observador.disconnect();
        }
      },
      { rootMargin: margem }
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [apareceu, margem]);
  return [ref, apareceu];
}

/** true quando a consulta de mídia casa (ex.: '(min-width: 900px)'). */
export function useMidia(consulta) {
  const [casa, setCasa] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(consulta).matches : false));
  useEffect(() => {
    const midia = window.matchMedia(consulta);
    const ao = () => setCasa(midia.matches);
    ao();
    midia.addEventListener('change', ao);
    return () => midia.removeEventListener('change', ao);
  }, [consulta]);
  return casa;
}

/** Densidade de pixels para os fundos animados: menor no celular, para poupar bateria. */
export function useDensidade() {
  const pequeno = useMidia('(max-width: 720px)');
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, pequeno ? 1.25 : 1.5);
}

/** Valor que só muda depois de `espera` ms sem novas alterações. */
export function useAtrasado(valor, espera = 250) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const relogio = setTimeout(() => setAtrasado(valor), espera);
    return () => clearTimeout(relogio);
  }, [valor, espera]);
  return atrasado;
}

/** Largura atual de um elemento. Devolve [ref, largura]. */
export function useLargura() {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return undefined;
    const medir = () => setLargura(elemento.getBoundingClientRect().width);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return [ref, largura];
}
