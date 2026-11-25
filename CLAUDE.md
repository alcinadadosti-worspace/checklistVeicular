# Checklist Veicular — contexto para o Claude

App web **estático** (Vite + React 19) para os motoristas de rota registrarem o checklist do
veículo e para a administração acompanhar. Publicado como _Static Site_ no Render a partir da
branch `main` deste repositório (**público**). Banco: Cloud Firestore, projeto `checklistveicular-6a274`.

- Unidade **Penedo**: Toyota Hilux Cabine Simples, motorista padrão Rogerio.
- Unidade **Palmeira dos Índios**: Volkswagen Saveiro 2025, motorista padrão Caique.
- **Administração**: Ludmylla.
- Tudo em **português do Brasil**: interface, nomes no código, commits e conversa com o usuário.
  O usuário não é programador: explique em linguagem simples e passe os passos manuais
  (console do Firebase, Render) como lista numerada.

## Retomar ("vamos continuar")

Quando o usuário escrever **"vamos continuar"**:

1. Leia **Estado atual** (abaixo) e, se existir, a memória local do projeto (códigos de acesso,
   como dar push).
2. Rode `git status -sb --untracked-files=all` e `git log --oneline -5`. Arquivos novos ou commits
   que não estão descritos aqui são novidade do usuário: entenda antes de agir e **não** versione
   arquivos dele sem perguntar (o repositório é público).
3. Responda com um resumo curto: onde paramos, o que mudou desde então e o próximo passo. Faça as
   perguntas pendentes de uma vez só (seção "Perguntar ao usuário") e siga com o que não depende delas.
4. Ao concluir uma etapa, atualize **Estado atual** (com a data) e faça commit + push — o usuário
   autorizou commit e push neste projeto. Adicione arquivos **pelo nome**, nunca `git add -A`.

## Estado atual — 25/11/2026 (manhã)

**Pronto** (último commit de funcionalidade: `27b6b4e`):

- Login por código; checklist em 4 passos (motorista, veículo/KM, inspeção, revisão) com data e
  hora automáticas; viagem "em rota" até o KM de volta; painel da administração (indicadores,
  filtros, ficha, exclusão, exportação CSV). Os 8 componentes do React Bits pedidos, em uso.
- **Motoristas por unidade** (25/11): Penedo — Rogerio (padrão) e Marcio; Palmeira — Caique
  (padrão) e Pedro; mais "Outro" nas duas (quem dirigir o carro da outra unidade usa "Outro").
  Fotos de Marcio e Pedro versionadas com autorização do usuário (ficam públicas).
- Sincronização com o Firestore **validada no banco real** (gravar, ler, atualizar, fila offline,
  regras recusando dados inválidos, exclusão entre aparelhos). Funciona offline após a 1ª visita.
- **Site no ar no Render**, criado pelo usuário como Static Site em 24/11 (~12h). O endereço fica
  só na memória local (o repositório é público). Os 2 checklists de teste do usuário foram feitos
  nesse site e chegaram ao banco: site e banco estão ligados. O site aponta para
  `checklistveicular-6a274`; os cabeçalhos do `render.yaml` não valem no Static Site (os padrões do
  Render bastam).
- Testes: 30 de dados (`npm test`) e 6 de navegador em `tests/e2e` (fluxo do motorista nas duas
  unidades e offline passando em 25/11, na prévia local).

**Pendente — publicação:** o Render **não publicou sozinho** os pushes depois de 24/11 ~12h (o site
continua com a versão de `2d3e691`, sem Marcio e Pedro). Pedido ao usuário: no painel do site,
ver em Events se houve deploy com erro; Manual Deploy → Deploy latest commit; e ligar o
Auto-Deploy (Settings → Build & Deploy). Para saber se a versão nova entrou no ar, comparar o
`index-*.js` citado na página com o de `dist/index.html` de um build local (o build é determinístico).

**Depois do deploy:** testar o site publicado com `TARGET_URL=<endereço>`: `dois-aparelhos-banco-real.js`
(celular + computador, registro "TESTE AUTOMATICO" excluído no fim) e `offline.js` (service worker).

**Banco de produção:** os 2 checklists de teste do usuário (24/11) foram excluídos em 25/11 a pedido
dele — ficam no banco com `excluido: true` (a marcação que avisa os outros aparelhos) e não
aparecem no app. A limpeza de `dois-aparelhos-banco-real.js` passou a fazer o mesmo (25/11, ainda
não rodada): não apaga documento de vez, porque um documento apagado nunca chega aos aparelhos que
já tinham baixado o registro, que ficaria preso neles.

**Sem versionar:** `img/separacao-lote-2026-11-24_1633.pdf` (não é deste app) — **não fazer commit**.
`preparar-fotos` só converte imagens, então ele não entra no site.

**Oferecido, não pedido** (só fazer se o usuário pedir): tornar o repositório privado; login de
verdade com Firebase Authentication e regras exigindo login; modelos `.glb` profissionais no lugar
dos carros estilizados; acentuar os nomes ("Rogério"); copiar os cabeçalhos do `render.yaml` no
painel do Render (opcional).

## Comandos

| Comando                             | O que faz                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                       | servidor de desenvolvimento (porta 5173) — **sincroniza com o banco de produção** |
| `npm run build` / `npm run preview` | gera `dist/` / serve `dist/` na porta 4173                                        |
| `npm test`                          | testes de dados (`tests/*.test.js`, node:test)                                    |
| `npm run fotos`                     | refaz as fotos dos crachás a partir de `img/`                                     |
| `npm run modelos`                   | regenera os carros 3D (`public/models/*.glb`)                                     |
| `npm run codigo -- 12345`           | gera o hash de um código de acesso                                                |

## Mapa do código

- `src/config/frota.js` — unidades, veículos, motoristas (unidade, foto, foco, zoom), itens do checklist e hashes dos códigos.
- `src/config/firebase.js` — ID do projeto Firebase (`ID_PADRAO`, ou `VITE_FIREBASE_PROJECT_ID` no build).
- `src/lib/registros.js` — regras do checklist (criar, validar, retorno, resumo, último KM).
- `src/lib/banco.js` — banco local (localStorage) e fila de envio; o maior `atualizadoEm` vence conflitos.
- `src/lib/nuvem.js` — Firestore pela API REST: `documents:commit` com carimbo `servidorEm` do
  servidor; `documents:runQuery` incremental por `servidorEm` (relê 1 min de margem).
- `src/lib/sincronizacao.js` — ciclo baixar → enviar, com novas tentativas e modo offline.
- `src/lib/cracha.js` — desenha frente, verso e cordão do crachá (canvas) para o Lanyard.
- `src/telas/` — Login, Inicio, Checklist, Retorno, Sucesso, Admin. `src/App.jsx` guarda as rotas
  no `history` do navegador (o botão voltar do celular funciona).
- `src/reactbits/` — cópias do registro oficial do React Bits. **Não refatorar.** Única exceção:
  `ModelViewer.jsx` ganhou as props `children` e `rotationOrder` (comentado no topo do arquivo).
- `scripts/sw-modelo.js` — service worker (o build gera `dist/sw.js`); `scripts/gerar-modelos.mjs` —
  carros 3D por código; `scripts/preparar-fotos.mjs` — fotos; `scripts/gerar-codigo.mjs` — hash.
- `firestore.rules` — regras publicadas no console do Firebase (se mudar aqui, publicar lá também).
- `render.yaml` — configuração do site no Render.

## Cuidados

- **Repositório público:** nunca escrever os códigos de acesso em texto puro (nem em testes,
  scripts ou commits). No código ficam só os hashes; os testes recebem os códigos por
  `CODIGOS_TESTE="penedo=…,palmeira=…,admin=…"`. Fotos de pessoas também ficam públicas.
- **Banco de produção:** `dev` e `preview` sincronizam com ele e já há dados do usuário. Testes de
  navegador bloqueiam `firestore.googleapis.com`; os que usam o banco real só criam e mexem em
  registros com motorista **"TESTE AUTOMATICO"** e os excluem no fim. Excluir = marcar
  `excluido: true` com `atualizadoEm` novo e carimbo `servidorEm` (como o app); **não apagar o
  documento de vez** se algum aparelho pode tê-lo baixado — ele nunca saberia da exclusão. (As
  regras só deixam apagar de vez documento já marcado `excluido: true`; `firestore-real.mjs` faz
  isso de propósito, segundos depois de criar, para conferir essa regra.) Conferir o banco:
  `curl "https://firestore.googleapis.com/v1/projects/checklistveicular-6a274/databases/(default)/documents/checklists?pageSize=50"`.
- Formatar com Prettier (`npx prettier --write …`, config em `.prettierrc.json`) antes de
  commitar; `src/reactbits` fica de fora.
- O aviso `matter-js: delta argument…` no console vem do FolderFloat e é inofensivo.

## Testes de navegador (`tests/e2e`)

Rodam com o executor do skill de Playwright, sem janela e com a GPU real
(`headless: true, channel: 'chromium'` — com janela visível o WebGL cai para 1 quadro/s quando
ela fica atrás de outras janelas). Antes: `npm run build && npm run preview` (ou `npx vite build`
\+ `npx vite preview`).

```bash
CODIGOS_TESTE="penedo=…,palmeira=…,admin=…" node ~/.claude/skills/playwright/run.js tests/e2e/<arquivo>.js
```

| Arquivo                                                                       | Banco        | Códigos         |
| ----------------------------------------------------------------------------- | ------------ | --------------- |
| `fluxo-motorista.js` — login → 4 passos → envio → retorno (`MODO`, `UNIDADE`) | bloqueado    | da unidade      |
| `administracao.js` — painel, filtros, CSV, exclusão, Palmeira, botão voltar   | bloqueado    | admin, palmeira |
| `navegacao-voltar.js` — botão voltar no assistente, rascunho, sair            | bloqueado    | —               |
| `offline.js` — checklist inteiro sem internet depois da 1ª visita             | bloqueado    | penedo          |
| `capturas.js` — capturas das telas principais (celular e computador)          | bloqueado    | —               |
| `dois-aparelhos-banco-real.js` — motorista e administração sincronizando      | **produção** | penedo, admin   |

Sem navegador, contra o banco real: `node tests/integracao/firestore-real.mjs`. As capturas vão
para a pasta temporária do sistema (`checklist-e2e`) ou para `SAIDA`. Todos aceitam
`TARGET_URL` (padrão `http://localhost:4173`) para rodar contra o site publicado. Os dois testes de
produção passaram em 24/11 numa versão anterior; a limpeza nova de `dois-aparelhos-banco-real.js`
(25/11) ainda não foi rodada — confira o banco depois de rodá-lo.
