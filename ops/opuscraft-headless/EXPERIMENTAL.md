# OpusCraft — primeira partida experimental (PR #41)

Este procedimento **não inicia nem altera serviços de produção**. A rota `/__dedicated` e o executável existem apenas no código do PR, até publicação autorizada.

## Requisitos
- Node.js 24, dependências do GamesNavagador instaladas (`npm install`)
- Compilar o cliente e a engine original: `bash ops/build-opuscraft.sh`
- Para testar o navegador via GamesNavagador, iniciar **ambos** os processos experimentalmente com o **mesmo** segredo de acesso, e o jogo sob o mesmo domínio/origem permitido por `server.cjs`

## Iniciar em ambiente experimental isolado

Em um checkout separado da branch, após o build:

```bash
export OPUSCRAFT_WORLD_DIR="$(pwd)/tmp/opuscraft-test-world"
export OPUSCRAFT_SEED="primeiro-mundo-teste"
export OPUSCRAFT_JOIN_CODE="ABCD1234"
export OPUSCRAFT_DEDICATED_MODE="creative"
export OPUSCRAFT_DEDICATED_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
node ops/opuscraft-headless/run-dedicated.cjs
```

O serviço escuta **somente** `127.0.0.1:4185`. Não há abertura de porta pública. Para uma sessão experimental, configure no servidor web a mesma variável `OPUSCRAFT_DEDICATED_TOKEN` (sem expô-la ao navegador). Não substitua o servidor em produção para testar.

## Entrada no navegador

O fluxo opt-in preparado é:
`?minecraft=dedicated&code=ABCD1234` na página principal; ao abrir Minecraft, o iframe usa `/opuscraft/index.html?mp=dedicated&code=ABCD1234`.

A aplicação autentica o upgrade para `/__dedicated` com o cookie de sessão, valida a origem e encaminha o tráfego para `127.0.0.1:4185` com o token interno. **O cliente WebGL já passou na CI com dois navegadores, mas ainda não foi testado pela rota autenticada de produção na VPS.** O serviço não deve ser exposto na internet antes de testar autenticação, carregamento e reconexão.

## Diagnóstico rápido

- `EXPERIMENTAL_NODE_OPUSCRAFT_READY`: processo subiu
- `OPUSCRAFT_DEDICATED_STATUS`: mostra ticks, jogadores, chunks e pendências a cada 30 segundos
- `Unauthorized`: token diferente ou sessão web inválida
- `Invalid OpusCraft frame`: cliente não usa protocolo binário original
- Se o navegador permanecer na tela de conexão, checar se o cliente e o servidor foram compilados a partir do **mesmo checkout**, incluindo a identificação de build compartilhada.

O mundo é **descartável** nesta fase: não há garantia de persistência integral de entidades, block entities e ticks. Não usar para construções que precisam ser preservadas.

## Antes de ativar o serviço systemd de teste

Apenas quando decidir publicar um ambiente experimental: confirmar que o Node em `/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/node` ainda existe, que o usuário `gamesforchildren` pode ler o código e que o diretório `/home/gamesforchildren/data/opuscraft-experimental` existe e tem permissão de escrita.

O arquivo de variáveis protegido, `/home/gamesforchildren/.config/opuscraft-dedicated.env`, deve conter `OPUSCRAFT_WORLD_DIR=/home/gamesforchildren/data/opuscraft-experimental`, a seed, o código, o modo e o token. Restringir leitura ao usuário do serviço (permissão `0600`). A aplicação principal precisa do **mesmo token** via ambiente; apenas iniciar o serviço dedicado não basta para habilitar o gateway.

**Não ativar `opuscraft-dedicated.service.example` diretamente** e não substituir o serviço principal atual sem preparar rollback. O arquivo é um modelo desabilitado, para revisão e instalação controlada.
