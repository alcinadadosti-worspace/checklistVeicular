// ---------------------------------------------------------------------------
// Banco de dados (Firebase · Cloud Firestore)
// ---------------------------------------------------------------------------
// Basta o "ID do projeto" (Console do Firebase → ⚙ Configurações do projeto → Geral).
// Não é segredo: é só o endereço do banco. Quem controla o que pode ser lido e gravado
// são as Regras do Firestore (veja o README).
//
// Com o ID vazio o app funciona em "modo local": cada aparelho guarda os seus próprios
// checklists e a administração só enxerga o que foi preenchido naquele aparelho.
//
// Também dá para definir pelo ambiente de build (Render → Environment):
//   VITE_FIREBASE_PROJECT_ID=meu-projeto

const ID_PADRAO = '';

export const FIREBASE_PROJECT_ID = (import.meta.env?.VITE_FIREBASE_PROJECT_ID || ID_PADRAO).trim();
export const COLECAO = 'checklists';
