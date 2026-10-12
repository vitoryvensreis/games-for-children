# 🎮 GamesForChildren

Plataforma familiar de jogos PWA em Node.js, HTML Canvas, WebSocket e voz WebRTC.

## MVP da corrida
- Uma corrida de 60 segundos com 3 faixas, obstáculos e pontuação controlada pelo servidor (+10 por desvio, -5 por batida).
- Modo solo e em dupla com código de sala. Dois celulares independentes.
- Biblioteca de jogos preparada para novos jogos.
- Login persistente em cookie HttpOnly + Secure (até 90 dias), bloqueio e desconexão via ADM.
- Perfis de criança criados pelo ADM; limite diário, estado online e histórico de acessos.
- Voz opcional por WebRTC com sinalização WebSocket (STUN público, TURN ainda não configurado). O ADM pode entrar nas salas com identificação explícita. Permissão de microfone sempre é solicitada pelo navegador.
- Notificações do ADM enquanto o painel está aberto. Push em segundo plano não está implementado.

## Stack
Node.js 24, `ws`, Canvas 2D, PWA simples. Dados em arquivo JSON com escrita atômica em `data/state.json` para uso de poucos jogadores. Não adequado para escala pública sem migração para banco de dados.

## Preparação de produção (CloudPanel / VPS)

**NÃO publique sem configurar o ambiente.** O workflow faz validação a cada push, mas o deploy só acontece quando as variáveis do repositório `ENABLE_DEPLOY=true` e `APP_READY=true`.

O serviço existente fica em `games-for-children.service`. Edite somente esse serviço, não o vhost de outros sites.

1. Abra terminal SSH da VPS como **root**.
2. Gere uma senha inicial de administrador (guarde o valor, não envie ao chat):
   ```bash
   ADMIN_PASS="$(openssl rand -hex 20)"
   printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASS" > /etc/gamesforchildren.env
   chmod 600 /etc/gamesforchildren.env
   printf 'Senha inicial de Administrador: %s\n' "$ADMIN_PASS"
   unset ADMIN_PASS
   ```
3. Configure arquivo de ambiente para esse serviço:
   ```bash
   mkdir -p /etc/systemd/system/games-for-children.service.d
   printf '[Service]\nEnvironmentFile=/etc/gamesforchildren.env\n' > /etc/systemd/system/games-for-children.service.d/10-env.conf
   systemctl daemon-reload
   ```
4. No GitHub → Settings → Secrets and variables → Actions → Variables, cadastre `APP_READY=true`. Os secrets SSH e `ENABLE_DEPLOY=true` já foram previamente preparados.
5. Em Actions → Deploy GamesForChildren → Run workflow. Verifique `DEPLOY_HEALTH_OK` e teste `https://gamesforchildren.escotilhaprodutora.com/api/health`.
6. Entre em `https://gamesforchildren.escotilhaprodutora.com` usando **Administrador** e a senha criada. Cadastre os perfis infantis no painel.

**Segurança:** senhas e chaves SSH nunca devem ser enviadas por chat nem commitadas. A chave de deploy exposta anteriormente deve ser revogada. O login persistente é intencional, mas o ADM pode revogar a sessão. Apenas contas criadas no painel têm acesso.

## Desenvolvimento
```bash
npm install
ADMIN_PASSWORD="senha-local-longa-de-teste" npm start
```
No ambiente local, ajuste o Origin permitido no backend para testes WebSocket, ou teste na origem de produção.

## Testes
```bash
npm install
node --check server.cjs
node --check public/app.js
node --test tests/integration.cjs
```

## Limitações conhecidas da primeira versão
- Chat de voz: WebRTC navegador a navegador. Pode falhar em algumas redes móveis sem um TURN configurado; o microfone fica desligado por padrão. Ainda requer testes em dois aparelhos reais.
- Notificações não são Push em background.
- Os controles e o placar precisam de homologação em aparelhos reais antes do uso por crianças.
- O sistema salva pequenos volumes em JSON e não é voltado para usuários públicos.


## OpusCraft original — multiplayer hospedado por um jogador (10/2026)

O cliente é compilado diretamente do upstream `Oppenheimerism/OpusCraft`, fixado
em `bc0c753f730ef15bc8f8acf093d40797700b87ee`, **sem modificar o código do jogo**.
A única personalização é o aplicativo que incorpora o jogo e autentica conexões
ao relay websocket. A VPS **não executa nem salva um mundo** e não roda Chromium.

### Como jogar em família

1. Um jogador (preferencialmente em PC) entra no GamesNavagador → OpusCraft,
   escolhe **Um jogador**, cria ou abre um mundo no próprio navegador.
2. Dentro do mundo, pressiona Esc → **Open to LAN** → **Start LAN World**;
   anota o código exibido. Mantém o navegador e o mundo abertos.
3. Os outros jogadores entram no GamesNavagador → OpusCraft → **Multiplayer**,
   selecionam o mundo anunciado, informam nome e código de entrada.
4. A VPS apenas repassa pacotes de rede; o anfitrião gera, simula e **salva
   o mundo no IndexedDB do navegador anfitrião**. Cada convidado renderiza
   seus chunks e gráficos localmente.
5. O anfitrião pode criar um **Backup** pelo menu original e exportar um
   arquivo `.world`. Se trocar de computador ou limpar os dados do navegador,
   deverá importar o backup para recuperar o mundo.
6. Se o anfitrião fechar o mundo/aba ou a conexão cair, a sessão multiplayer
   encerra. Não é um servidor persistente 24h.

### Comunicação e controle parental

A voz WebRTC e o chat familiar pertencem à plataforma, não ao OpusCraft.
O controle de usuários, limites, bloqueio e voz no painel dos pais continua
funcionando. Comandos exclusivos de ADM para OpusCraft (tempo, clima, teleporte,
atrações, NPC e monitor de mundo) foram removidos.

### Integridade e limitações

- O relay aceita apenas contas logadas no GamesNavagador, respeita expiração
  de sessão e limite parental, só admite **um mundo anfitrião simultâneo**
  e preserva as restrições nativas do OpusCraft.
- A restrição de hospedagem por localhost do relay original permanece. Somente
  o gateway autenticado da plataforma faz a conexão interna localhost para
  anfitriões autorizados; **não há porta de hospedagem pública nem proxy aberto**.
- OpusCraft original não significa Minecraft oficial. O cliente pode ficar
  lento em celulares fracos por custo local de WebGL2/chunks, mesmo que a VPS
  não hospede o mundo. Hospedar em PC costuma ser mais adequado.
- O perfil antigo de Chromium do mundo V1/V2/V3 é eliminado da VPS **somente
  após o novo relay passar no health check de produção**, por autorização expressa.
  Os backups individuais dos usuários na plataforma e os outros jogos são
  preservados. Mundos locais já salvos em navegadores dos usuários não são
  apagados remotamente.

### Checagem operacional

```bash
curl -fsS http://127.0.0.1:4173/__health
# Exemplo sem anfitrião conectado:
# {"ready":true,"mode":"player-hosted","hosting":false,"guests":0,"connections":0}
```

O teste `ops/opuscraft-browser-relay-smoke.cjs` comprova anúncio de mundo e
comunicação host ↔ convidados, sem Chromium na VPS.

