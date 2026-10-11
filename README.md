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


## OpusCraft — único Minecraft ativo (mundo familiar criativo), mundos individuais e teleporte (10/2026)
- Abrir OpusCraft pelo catálogo agora exibe o **menu inicial original**: Um jogador, Multiplayer e Configurações. Não conecta automaticamente à VPS até a família escolher Multiplayer.
- Em **Um jogador**, o menu nativo permite criar/continuar/renomear/excluir mundos com modos Criativo, Sobrevivência, Aventura, Espectador e Hardcore, semente, dificuldade, geração de estruturas e regras. O mundo local salva automaticamente no IndexedDB do próprio aparelho/navegador.
- Na seleção de mundos há **Backup na VPS** e **Restaurar da VPS**. São ações manuais e autenticadas, independentes por perfil; o backup não sincroniza automaticamente mundos entre dispositivos. Cada arquivo pode ter até 64 MB, com cota de 400 MB por conta e até três versões por mundo. A restauração cria outra cópia, sem sobrescrever o mundo atual.
- Em **Multiplayer**, a entrada **Servidor da Familia - Entrar** é fixa e usa identidade da sessão do GamesNavagador. O mundo familiar antigo da VPS permanece com seus blocos e inventários. O menu LAN original continua disponível, mas **outros mundos hospedados permanentemente para cada criança ainda não estão implementados**.
- No mundo familiar, o overlay **Jogadores / Teleporte** mostra apenas perfis realmente conectados; tocar em Ir até executa teleporte autoritativo pelo host do OpusCraft. Só funciona quando ambos estão no mesmo mundo e dimensão; há intervalo de 6 segundos entre teletransportes.
- O mundo do servidor continua hospedado 24h na VPS, sem precisar manter um celular ligado. Mundos individuais ficam no aparelho e podem ser copiados manualmente para a VPS.
- Limites parentais continuam verificados periodicamente no cliente de mundo individual; para o multiplayer a conexão é autenticada e pode ser encerrada pelo ADM. Jogar localmente não fornece segurança antiviolação absoluta contra clientes modificados.



## Mundo da família: servidor invisível e aventuras de Caique e Cauã

- A **Andarilha** é apenas a conta interna do host que mantém o mundo online na VPS.
  Ela fica **imóvel e em modo espectador (invisível)**, sem fome, sede, sobrevivência,
  construções próprias, diálogos ou qualquer conexão com Groq, Gemini e outras IAs.
  O mundo **permanece criativo para as crianças**.
- A VPS recebe um pequeno mecanismo de atrações não-IA: letreiro de blocos com os
  nomes **CAIQUE** e **CAUÃ** (com til), moinho com pás animadas quando há visitantes,
  castelo, vila, jardim e torre de observação.
- As atrações são construídas **no mesmo mundo**, por lotes limitados, apenas em
  áreas livres e previamente inspecionadas. O sistema usa tickets temporários
  de chunks para criar regiões adicionais **sem mover a Andarilha**.
  Nenhuma área ocupada deve ser substituída; se um bloco desconhecido surgir,
  a obra pausa. Terreno natural com vegetação densa/árvores também é rejeitado.
- A localização das atrações concluídas aparece no painel do ADM como **X e Z**.
  O botão **Ir ao letreiro** é restrito ao ADM já conectado ao multiplayer.
- Para preservar o mapa, a construção só adiciona blocos em posições vazias ou
  ocupadas por vegetação leve; **não escava, não apaga construções existentes,
  não regenera mundos e não altera a semente**.
- A progressão das atrações está em uma chave local, específica do mundo, no
  armazenamento do Chromium hospedado na VPS. Os blocos continuam salvos no
  IndexedDB original do OpusCraft, e a conclusão só é registrada depois de um
  salvamento bem-sucedido. Um reinício retoma verificando os blocos existentes.
- As vilas naturais, os aldeões e a fauna do OpusCraft continuam ativos, conforme
  as regras já existentes. Nenhum serviço externo de geração é necessário.
- **Proteção conservadora:** sem histórico de origem de cada bloco, nenhuma
  heurística pode garantir 100% a distinção entre todos os blocos naturais e
  os colocados por jogadores. Por isso, a implantação só autoriza acrescentar
  blocos em áreas visualmente livres.

Para inspecionar o mundo na VPS:
```bash
curl -sS http://127.0.0.1:4173/__health
curl -sS http://127.0.0.1:4173/__npc/status | python3 -m json.tool
```

## Versões anteriores (arquivadas)
As integrações MCGalaxy e ClassiCube foram removidas do código de produção. O OpusCraft permanece como único jogo de blocos ativo.
Dados históricos e construções do servidor antigo não são apagados: caso existam na VPS, os arquivos `.lvl` e a configuração antiga são preservados em `backup/classicube-legacy.tar.gz` antes de qualquer limpeza. Esse backup é independente do mundo e perfil persistentes do OpusCraft em `data/opuscraft/profile`.
