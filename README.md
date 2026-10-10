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


## Minecraft — exploração criativa com mineração
- Removido o painel de corações/fome; o limite de tempo do responsável permanece ativo.
- Inventário de recursos e picaretas continuam controlados pelo servidor.
- Espadas de madeira/pedra/ferro e armaduras de ferro/ouro podem ser fabricadas e persistem como itens colecionáveis, ainda sem aparência 3D equipada e sem combate.
- Portais físicos são montados em terreno livre e plano nos mapas Exploração/Mineração; exigem 8 pedras e 2 ferros (ADM isento). O plugin usa portais persistidos no banco do MCGalaxy: os backups também devem incluir esse banco, além dos arquivos .lvl.
- Ovelhas, porcos e galinhas caminham pelo servidor; validar comportamento no Safari/PWA iOS.
- Perfis infantis, controle parental e autenticação existentes foram preservados.


## Minecraft — livre construção, inventário e controles mobile (10/10/2026)
- Todos os blocos podem ser colocados e quebrados sem ferramentas obrigatórias, consumo de recursos ou limite artificial de mineração. A proteção das casas e o bloqueio parental global continuam ativos.
- A coleta de minerais agora é apenas um contador opcional. Equipamentos e portais fabricáveis são gratuitos. Espadas e armaduras continuam itens decorativos, sem combate 3D.
- O botão BLOCOS em /classicube/ abre o inventário nativo do ClassiCube 1.3.8 (tecla B), com grade de texturas e seleção de bloco para hotbar.
- Controles touch usam os atalhos oficiais: Z alterna voo, Q sobe, E desce, Espaço pula, mouse esquerdo quebra e direito coloca. Toques contínuos repetem a ação e liberam no cancelamento.
- Oito skins self-hosted de 64x32 com preview pixelado no menu FAMÍLIA, sem upload arbitrário nem URLs externas.
- Validar em iPhone PWA: abrir inventário/selecionar bloco, quebrar/colocar, alternar voo, subir/descer e liberar botão. O painel parental, os mundos e o multiplayer não foram modificados.
