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

## Estado atual — 27/11/2026 (fim da tarde)

**Pronto e no ar** (27/11: crachás, fotos e volta pela saída seguinte; Manual Deploy do usuário às
11h39, `index-CM6jYYiP.js`):

- Login por código → **"Quem está acessando?"** com os crachás dos motoristas da unidade (e "Outro
  motorista" com nome); a escolha fica na sessão (`sessao.motorista`) até sair, e "Trocar
  motorista" no início muda sem redigitar o código. Sessão antiga sem motorista cai nessa tela.
- Checklist em **3 passos** (veículo/KM, inspeção, revisão; o motorista vem da sessão) com data e
  hora automáticas; viagem "em rota" até o KM de volta; painel da administração (indicadores,
  filtros, ficha, exclusão, exportação CSV). Os 8 componentes do React Bits pedidos, em uso.
- **Volta pela saída seguinte** (27/11, aprovado pelo usuário): saiu a chave "Já voltei" do passo 1
  (todo checklist sai em rota). "Registrar retorno" continua; se o motorista esquecer, ao enviar o
  checklist seguinte do veículo a viagem aberta é fechada com o KM de saída dele
  (`fecharPelaSaidaSeguinte` em `registros.js`; `retornoEm` = hora desse checklist;
  `voltaPelaSaidaSeguinte: true`, mostrado na ficha e na coluna "KM de volta informado por" do CSV).
  Se o KM novo for menor que a saída da viagem aberta, ela não é fechada (aviso no passo 1).
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
- **Versão com Marcio e Pedro no ar** desde 27/11 (~10h), por Manual Deploy do usuário. No site
  publicado passaram em 27/11: `fluxo-motorista.js` nas duas unidades e `offline.js` (os dois
  bloqueiam o banco).
- Testes: 52 de dados (`npm test`) e 8 de navegador em `tests/e2e`, todos passando em 27/11 na
  prévia local; `dois-aparelhos-banco-real.js` (com foto) passou na prévia local contra o banco
  real, já com as regras novas.
- **Revisão de bugs (27/11, pedido do usuário; não publicado):** quando dois aparelhos discordam,
  vale o **peso da versão** (`pesoDaVersao`: excluído > volta registrada > volta pela saída seguinte
  > em rota) e só no empate o maior `atualizadoEm` — a volta automática nunca desfaz uma volta real
  > nem ressuscita excluído. Registros vindos da nuvem passam por `normalizarRegistro`. Volta automática
  > só até 2.000 km (`KM_MAXIMO_ENTRE_SAIDAS`). Cofre de fotos v2 (IndexedDB `clv-fotos` versão 2,
  > índice `fila`: enviar/apagar/nada): reabre a conexão antes de cair para a memória, lê os dois
  > lugares; fotos de excluídos entram na fila "apagar" e são retiradas da nuvem em ciclos seguintes;
  > foto só sobe depois do checklist dela; o assistente espera fotos "Preparando…"; envio de foto com
  > prazo pelo tamanho (máx. 450 KB). `dois-aparelhos-banco-real.js` usa KM 1→124 para não fechar
  > viagens reais.
- **Revisão/manutenção na inspeção** (27/11, pedido do usuário; **não publicado**): botão
  "Registrar revisão ou manutenção" no passo Inspeção abre um quadro com "O que foi feito" e até 4
  fotos; vai no registro como `manutencao: { descricao, fotos }` (ou null; sem texto não conta, e
  foto sem texto é cobrada). Fotos na mesma coleção `fotos` (`fotosDoRegistro` junta as duas listas
  para envio e exclusão). Ficha e lista com selo; filtro "Com manutenção" e busca na administração;
  colunas "Revisão/manutenção" e "Fotos da manutenção" no CSV. Regras do Firestore sem mudança.
- **Carros 3D com baú fechado** sobre a caçamba (27/11, as duas picapes da frota usam; campo `bau`
  das fichas em `scripts/gerar-modelos.mjs`; modelos com ~410 KB). **Não publicado.**
- **Celular e tablet** (27/11, pedido "portabilidade"; **ainda não publicado** — falta Manual
  Deploy): app instalável (manifesto com `orientation: any`, ícones PNG em `public/icones/` por
  `npm run icones`, `apple-touch-icon`; Chrome confirma instalável), botão "Instalar o app" no login
  e no início (`src/lib/instalacao.js` + `src/componentes/Instalar.jsx`; no iPhone mostra o
  Compartilhar → Adicionar à Tela de Início). Celular deitado (`TELA_DEITADA_BAIXA` em `ganchos.js`
  e a mesma condição no CSS) usa o layout de duas colunas das telas largas, com login/teclado lado a
  lado. Topo reserva a barra de status do iPhone (`--topo-altura` com `safe-area-inset-top`) e as
  laterais desviam do entalhe (`--margem-lateral`). Barra de etapas corrigida para 3 colunas (estava
  com 4 desde a saída do passo "Motorista"). Toques ≥ 40 px (indicador da nuvem, atalhos, filtros).
- **Testado no site publicado em 27/11 (~11h45):** `fluxo-motorista.js` (Penedo e Palmeira),
  `offline.js`, `navegacao-voltar.js` e `dois-aparelhos-banco-real.js` com foto — tudo certo.
- **Pendente com o usuário:** **Manual Deploy** (celular e tablet, baú, manutenção); depois, rodar no site
  `aparelhos.js`, `instalacao.js` e `fluxo-motorista.js` com `TARGET_URL`. Deploy Hook (opcional) —
  sem ele, cada push precisa de Manual Deploy.

**Publicação no Render — sem Auto-Deploy:** o site foi criado pela opção "Public Git Repository"
(endereço colado), e nessa opção o Render **não publica sozinho** a cada push (não há webhook do
Render no GitHub). Cada push precisa de **Manual Deploy → Deploy latest commit** no painel.
Proposto ao usuário (27/11): criar um **Deploy Hook** (Settings → Deploy Hook) e passar a URL, que
fica só na memória local (é secreta), para publicar com `curl -X POST <url>` depois de cada push.
Recriar o site com o GitHub conectado também resolveria, mas muda o endereço. Para saber se a
versão nova entrou no ar, comparar o `index-*.js` citado na página com o de `dist/index.html` de
um build local (o build é determinístico).

**Site + banco conferidos em 27/11 (~10h15):** `dois-aparelhos-banco-real.js` passou no site
publicado (envio, retorno, offline, exclusão entre aparelhos) e os 2 registros "TESTE AUTOMATICO"
ficaram no banco com `excluido: true`. O usuário achou que o banco "não estava conectado"
(provavelmente porque o painel está vazio: todos os registros estão excluídos); o app ainda
**não está em uso real** (dito por ele em 27/11).

**Banco de produção — limpo em 27/11 (~15h20) a pedido do usuário:** os 10 checklists de teste já
excluídos (2 do usuário de 24/11 e 8 "TESTE AUTOMATICO") foram **apagados de vez**; o teste manual do
usuário (Rogerio, 56.787 km, 27/11 11h53) foi **excluído** como o app faz (`excluido: true`) e é o
único documento que resta — nenhum visível, nenhuma foto. A limpeza de `dois-aparelhos-banco-real.js`
só marca como excluído: não apaga documento de vez logo depois, porque um documento apagado nunca
chega aos aparelhos que já tinham baixado o registro, que ficaria preso neles (apagar de vez só
registros excluídos há tempo, depois de os aparelhos terem sincronizado).

**Fotos em "Outros" (27/11, pedido do usuário):** até 4 por checklist, reduzidas no aparelho
(`src/lib/fotosDoChecklist.js`: IndexedDB `clv-fotos`, JPEG ≤ 1280 px e ≤ 600 KB) e enviadas pela
sincronização depois do checklist para a coleção **`fotos`** (um documento por foto, bytes em
`dados`); o registro guarda só `fotos: [{ id, largura, altura }]`. A ficha baixa a foto ao abrir
(`src/componentes/Fotos.jsx`). Excluir o checklist apaga as fotos dele (as regras só deixam
apagar foto de checklist já excluído). **Regras novas publicadas pelo usuário em 27/11** (conferido:
GET em `fotos/<id inexistente>` dá 404, outra coleção dá 403). Se o `firestore.rules` mudar de novo,
o usuário precisa publicar no console.

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
| `npm run icones`                    | refaz os ícones do app instalado (`public/icones/`) a partir do `favicon.svg`     |

## Mapa do código

- `src/config/frota.js` — unidades, veículos, motoristas (unidade, foto, foco, zoom), itens do checklist e hashes dos códigos.
- `src/config/firebase.js` — ID do projeto Firebase (`ID_PADRAO`, ou `VITE_FIREBASE_PROJECT_ID` no build).
- `src/lib/registros.js` — regras do checklist (criar, validar, retorno, resumo, último KM).
- `src/lib/banco.js` — banco local (localStorage) e fila de envio; o maior `atualizadoEm` vence conflitos.
- `src/lib/nuvem.js` — Firestore pela API REST: `documents:commit` com carimbo `servidorEm` do
  servidor; `documents:runQuery` incremental por `servidorEm` (relê 1 min de margem).
- `src/lib/sincronizacao.js` — ciclo baixar → enviar, com novas tentativas e modo offline.
- `src/lib/cracha.js` — desenha frente, verso e cordão do crachá (canvas) para o Lanyard.
- `src/lib/instalacao.js` + `src/componentes/Instalar.jsx` — botão "Instalar o app" (Android) e dica
  do iPhone/iPad; `public/manifest.webmanifest` e `public/icones/` (`scripts/gerar-icones.mjs`).
- `src/lib/fotosDoChecklist.js` — fotos anexadas: cofre no aparelho (IndexedDB), redução, endereço
  para mostrar (do aparelho ou baixada da nuvem). `src/componentes/Fotos.jsx` — campo, galeria e visor.
- `src/telas/` — Login, Motorista ("Quem está acessando?"), Inicio, Checklist, Retorno, Sucesso, Admin. `src/App.jsx` guarda as rotas
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

| Arquivo                                                                        | Banco        | Códigos         |
| ------------------------------------------------------------------------------ | ------------ | --------------- |
| `fluxo-motorista.js` — código → crachá → 3 passos → envio → retorno            | bloqueado    | da unidade      |
| `administracao.js` — painel, filtros, CSV, exclusão, Palmeira, botão voltar    | bloqueado    | admin, palmeira |
| `navegacao-voltar.js` — botão voltar no assistente, rascunho, sair             | bloqueado    | —               |
| `offline.js` — checklist inteiro sem internet depois da 1ª visita              | bloqueado    | penedo          |
| `capturas.js` — capturas das telas principais (celular e computador)           | bloqueado    | —               |
| `aparelhos.js` — 10 telas em 7 aparelhos (celulares e tablets, em pé/deitados) | bloqueado    | —               |
| `instalacao.js` — instalável no Chrome, botão no Android, dica no iPhone       | bloqueado    | —               |
| `dois-aparelhos-banco-real.js` — motorista e administração sincronizando       | **produção** | penedo, admin   |

Sem navegador, contra o banco real: `node tests/integracao/firestore-real.mjs`. As capturas vão
para a pasta temporária do sistema (`checklist-e2e`) ou para `SAIDA`. Todos aceitam
`TARGET_URL` (padrão `http://localhost:4173`) para rodar contra o site publicado.
`dois-aparelhos-banco-real.js`, `fluxo-motorista.js` e `offline.js` passaram no site publicado em
27/11; depois de rodar um teste de produção, confira o banco.
