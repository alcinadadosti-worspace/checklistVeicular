# Checklist Veicular

Aplicativo web (site estático) para os motoristas de rota registrarem o checklist do veículo:
quilometragem de saída e de volta, motorista, itens inspecionados — com data e hora capturadas
automaticamente. A administração acompanha as duas unidades num painel.

- **Unidades:** Penedo (Toyota Hilux Cabine Simples) e Palmeira dos Índios (Volkswagen Saveiro 2025).
- **Acesso:** um código por unidade e um código da administração (teclado numérico na tela inicial).
- **Funciona sem internet:** depois da primeira visita o app abre offline; o que for preenchido fica
  salvo no aparelho e é enviado ao banco quando a conexão voltar.

## Como o motorista usa

1. Digita o código da unidade.
2. **Motorista** — escolhe um motorista da unidade (Penedo: Rogerio ou Marcio; Palmeira dos Índios:
   Caique ou Pedro) ou _Outro_ (digitando o nome). O crachá muda na hora.
3. **Veículo** — informa o KM de saída. Se já voltou, liga "Já voltei" e informa também o KM de volta.
4. **Inspeção** — marca cada item como _Bom_, _Ruim_ ou _Faltante / Não funciona_ e, se quiser,
   escreve algo em _Outros_.
5. **Revisão** — confere e envia. A data e a hora são gravadas pelo app nesse momento.
6. Se saiu sem informar o KM de volta, o veículo fica **em rota**; ao retornar, abre o app e toca em
   **Registrar retorno** (a data e a hora do retorno também são automáticas).

A administração entra com o código dela e vê: veículos em rota, checklists por período, itens com
apontamento, quilômetros rodados, a ficha de cada checklist, exportação para planilha (CSV) e exclusão.

## Rodar no computador

Precisa do [Node.js](https://nodejs.org) 20.19 ou mais novo.

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm run build      # gera a pasta dist/ (é o que vai para o ar)
npm run preview    # serve a pasta dist/ em http://localhost:4173
npm test           # testes da parte de dados
```

Há também testes de navegador em `tests/e2e` e um teste de integração com o banco em
`tests/integracao` — instruções no topo de cada arquivo e no [`CLAUDE.md`](CLAUDE.md).

## Publicar no Render (Static Site, plano gratuito)

No painel do Render: **New → Static Site**, escolha este repositório e preencha:

| Campo             | Valor                     |
| ----------------- | ------------------------- |
| Build Command     | `npm ci && npm run build` |
| Publish Directory | `dist`                    |

(Ou **New → Blueprint**: o arquivo `render.yaml` já traz essas configurações.)

A cada `git push` o Render publica de novo sozinho, se o **Auto-Deploy** estiver ligado (no painel
do site: **Settings → Build & Deploy → Auto-Deploy**). Se não estiver, publique à mão:
**Manual Deploy → Deploy latest commit**.

O site atual foi criado como **Static Site**. Nesse modo o Render não lê os cabeçalhos do
`render.yaml` (só no Blueprint) e usa os dele, que já bastam: a página e o service worker são
conferidos a cada visita, então o app se atualiza sozinho. Os do `render.yaml` são uma otimização
opcional — para usá-los, copie-os no painel do site, em **Headers**.

## Banco de dados (Firebase · Cloud Firestore)

**Este repositório já está ligado ao banco**: o ID do projeto (`checklistveicular-6a274`) está em
[`src/config/firebase.js`](src/config/firebase.js) e as regras publicadas são as de
[`firestore.rules`](firestore.rules). Todos os aparelhos enxergam os mesmos dados.

- O indicador no topo do app mostra a situação: _Sincronizado_, _N a enviar_, _Offline_ ou _Erro na
  nuvem_. Tocar nele mostra os detalhes e o botão **Sincronizar agora**.
- **Atenção:** rodar o app no computador (`npm run dev`) também grava nesse banco. Se for testar,
  use um nome de motorista de teste e exclua o registro depois pelo painel da administração.
- Para ver os dados direto na fonte: console do Firebase → Firestore Database → coleção `checklists`.

### Montar o banco do zero (outro projeto)

Sem ID de projeto, o app funciona em **modo local**: cada aparelho guarda só os próprios checklists
e a administração não enxerga o que foi preenchido nos outros. Para ligar a um projeto novo:

1. No [console do Firebase](https://console.firebase.google.com), abra o projeto e vá em
   **Criação → Firestore Database → Criar banco de dados**: edição _Standard_, ID `(default)`, local
   `southamerica-east1 (São Paulo)`, _modo de produção_.
2. Na aba **Regras**, apague o conteúdo, cole o do arquivo [`firestore.rules`](firestore.rules) e
   clique em **Publicar**.
3. Em **⚙ Configurações do projeto → Geral**, copie o **ID do projeto**.
4. Cole o ID em [`src/config/firebase.js`](src/config/firebase.js) (constante `ID_PADRAO`) e faça o
   push — ou, no Render, crie a variável de ambiente `VITE_FIREBASE_PROJECT_ID` com esse valor e
   mande publicar de novo.

Pronto: o indicador no topo do app passa de "Modo local" para "Sincronizado". O que já tinha sido
preenchido em modo local é enviado na primeira sincronização.

O app fala com o Firestore pela API REST oficial (não precisa de chave nem de biblioteca). O ID do
projeto não é segredo; quem controla o acesso são as regras.

## Personalizar

Tudo fica em [`src/config/frota.js`](src/config/frota.js): unidades, veículos, motoristas e itens.

- **Fotos dos crachás** — coloque a foto na pasta `img/` com o nome da pessoa (`Rogerio.png`,
  `caique.jpg`, `Ludmylla.jpg`). No próximo `npm run dev`/`build` ela é reduzida automaticamente.
  `foco` e `zoom`, em `frota.js`, ajustam o enquadramento do rosto. Quem não tem foto (ou escolhe
  _Outro_) aparece com a silhueta.
- **Códigos de acesso** — o repositório guarda só o _hash_ de cada código. Para trocar:
  `npm run codigo -- 12345` e cole o resultado no `codigoHash` correspondente.
- **Itens do checklist** — a lista `ITENS`.
- **Unidades e motoristas** — as listas `UNIDADES` e `MOTORISTAS`. Uma unidade nova precisa de um
  código (hash) e de um modelo 3D; nas regras do banco não muda nada.
- **Carros 3D** — os modelos de `public/models/` são gerados por código (`npm run modelos`) a partir
  das medidas reais de cada carro. São representações estilizadas, não réplicas. Para usar um modelo
  profissional, salve o arquivo `.glb` como `public/models/hilux.glb` ou `public/models/saveiro.glb`.

## Componentes do React Bits

O código de cada um está em `src/reactbits/`, copiado do registro oficial ([reactbits.dev](https://reactbits.dev)).

| Componente  | Onde aparece                                                                                |
| ----------- | ------------------------------------------------------------------------------------------- |
| Lanyard     | Crachá com foto: tela inicial, passo "Motorista" e painel da administração                  |
| ModelViewer | Carro da unidade em 3D: tela inicial, passo "Veículo" e painel da administração             |
| GridScan    | "Sala de varredura" atrás do carro                                                          |
| GhostFibers | Fundo do login, do crachá no passo "Motorista" e da tela de sucesso                         |
| Radar       | Viagem em andamento, registro do retorno e painel da administração                          |
| SloshGauge  | Tanque de progresso da inspeção e "condição" do veículo de cada unidade                     |
| CometDial   | Condição do veículo na revisão, KM rodados no retorno e seletor de período da administração |
| FolderFloat | Pasta de checklists: histórico, tela de sucesso e painel da administração                   |

No `ModelViewer` há duas pequenas adições (comentadas no topo do arquivo): um espaço para a
iluminação própria do app e a opção de inclinar a câmera em vez do modelo.

## Como funciona por dentro

- **Site estático** (Vite + React). Não há servidor próprio.
- **Primeiro o aparelho, depois a nuvem:** cada registro é gravado na hora no armazenamento do
  navegador e entra numa fila de envio. A sincronização roda ao abrir o app, ao voltar a internet,
  após cada gravação e de tempos em tempos (a cada 30 s com o painel da administração aberto).
- **Offline:** um _service worker_ (`scripts/sw-modelo.js`, gerado no build) guarda os arquivos do app.
- **Rascunho:** o que o motorista já preencheu não se perde se a página recarregar.

## Limites que vale conhecer

- Os códigos de acesso são uma barreira simples, conferida no próprio navegador — não é um login
  com senha forte. Servem para separar unidades e administração, não para proteger dados sigilosos.
- As regras do Firestore validam o formato dos registros, mas não exigem login (veja o comentário
  em `firestore.rules` para o caminho, se um dia precisar).
- As fotos da pasta `img/` fazem parte do site: quem tem acesso ao repositório ou ao site consegue vê-las.

## Estrutura

```
img/                 fotos originais dos crachás
public/models/       carros 3D (.glb)
scripts/             preparar fotos, gerar modelos 3D, gerar hash de código, modelo do service worker
src/config/          unidades, motoristas, itens e ID do Firebase
src/lib/             regras do checklist, banco local, nuvem, sincronização, desenho do crachá
src/componentes/     peças da interface
src/telas/           login, início, checklist, retorno, sucesso e administração
src/reactbits/       componentes do React Bits
tests/               testes da parte de dados; tests/e2e (navegador) e tests/integracao (banco real)
```
