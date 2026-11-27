// Instalar o app na tela inicial do celular ou tablet (ele abre em tela cheia, como um aplicativo).
//
// - Android e computador (Chrome, Edge, Samsung Internet): o navegador avisa que dá para instalar
//   (evento `beforeinstallprompt`); o app guarda esse aviso e mostra o botão "Instalar".
// - iPhone e iPad: não existe esse aviso; o app mostra como fazer pelo menu Compartilhar.
// - Já instalado (aberto pelo ícone): não mostra nada.

import { useSyncExternalStore } from 'react';

let pedido = null; // o aviso do navegador, guardado até a pessoa tocar em "Instalar"
let versao = 0;
const ouvintes = new Set();
const avisar = () => {
  versao += 1;
  for (const ouvinte of ouvintes) ouvinte();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault(); // em vez da faixa do navegador, o botão do próprio app
    pedido = evento;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    avisar();
  });
}

const abertoComoApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const iphoneOuIpad = () => {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1); // iPad novo se diz "Mac"
};

/** Abre a janela de instalação do navegador. Devolve true se a pessoa aceitou. */
export async function instalar() {
  const atual = pedido;
  if (!atual) return false;
  pedido = null; // o aviso só pode ser usado uma vez
  avisar();
  try {
    await atual.prompt();
    const escolha = await atual.userChoice;
    return escolha?.outcome === 'accepted';
  } catch {
    return false; // o navegador recusou abrir a janela (ex.: já aberta): fica como estava
  }
}

const assinar = ouvinte => {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
};
const obterVersao = () => versao;

/** 'instalado' | 'botao' (instala com um toque) | 'ios' (mostrar como fazer) | 'nada' */
export function useInstalacao() {
  useSyncExternalStore(assinar, obterVersao, obterVersao);
  if (typeof window === 'undefined' || abertoComoApp()) return 'instalado';
  if (pedido) return 'botao';
  if (iphoneOuIpad()) return 'ios';
  return 'nada';
}
