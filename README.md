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



## Andarilha: moradora autônoma do servidor da família
- O avatar do próprio host OpusCraft assume a identidade **Andarilha**. Ele anda por uma área isolada, constrói uma pequena casinha com blocos novos (sem quebrar estruturas existentes) e pode cumprimentar raramente as crianças com frases previamente aprovadas.
- O cérebro opcional usa a **API da GroqCloud (Groq, com Q)** exclusivamente no processo Node da VPS: decisões limitadas a `build`, `explore`, `hide` e `observe`, atualizadas no máximo a cada quatro minutos. Nenhuma chave, histórico de conversa ou nome de criança é enviado à API. Se a chave estiver ausente ou o serviço falhar, uma rotina local segura mantém a personagem em atividade.
- Para ativar GroqCloud, crie sua chave em `https://console.groq.com/keys` e configure `GROQ_API_KEY` no arquivo protegido `/etc/gamesforchildren.env` (nunca no Git, navegador ou chat). Opcional: `GROQ_MODEL=openai/gpt-oss-20b`. O modelo padrão GPT-OSS 20B é suportado pela GroqCloud e retorna ações por JSON Schema estrito. Reinicie apenas `games-for-children.service` após atualizar a configuração; sem a chave, a Andarilha continua em modo local.
- Somente **Administrador**, estando dentro do mundo multiplayer da família, recebe o botão **Ir até ela** em Jogadores / Teleporte. A API `/api/admin/opuscraft/npc/visit` repete a verificação de perfil e da sessão ativa. Crianças não têm acesso ao destino exato por API.
- O mundo existente continua sendo o mesmo. **Não há reset, regeneração nem exclusão automática do perfil IndexedDB**. Antes de eventual recriação manual, preserve uma cópia do diretório `data/opuscraft/profile` com o serviço parado; esta integração não precisa recriar o mapa.
- A área de construção é deliberadamente pequena. É um primeiro marco de IA com ações seguras, não um bot com acesso irrestrito aos comandos do jogo. O menu administrativo mostra a personagem quando a sessão multiplayer está ativa.

## Versões anteriores (arquivadas)
As integrações MCGalaxy e ClassiCube foram removidas do código de produção. O OpusCraft permanece como único jogo de blocos ativo.
Dados históricos e construções do servidor antigo não são apagados: caso existam na VPS, os arquivos `.lvl` e a configuração antiga são preservados em `backup/classicube-legacy.tar.gz` antes de qualquer limpeza. Esse backup é independente do mundo e perfil persistentes do OpusCraft em `data/opuscraft/profile`.

## Andarilha — arquiteta de mundo (primeira etapa)

A personagem residente do mundo familiar é uma **arquiteta de obras**. Não tem fome/sede
nem objetivos de sobrevivência: planeja uma obra, executa bloco a bloco,
registra a conclusão, então solicita outra ideia. O avatar VPS usa o mesmo
IndexedDB e a mesma simulação OpenCraft de sempre — **não redefina o perfil**.

### Gemini (chave privada no servidor)

Gere uma chave em https://aistudio.google.com/apikey e configure
`GEMINI_API_KEY` **somente no ambiente da VPS** (systemd/EnvironmentFile já usado
pelo serviço). Opcional: `GEMINI_MODEL=gemini-3.5-flash-lite`.
A chave nunca deve aparecer no navegador, no painel do ADM ou no Git.
Sem chave configurada ou se a API falhar, a Andarilha usa um catálogo local
variável; os registros mostram `source=local` em vez de `source=gemini`.
O uso gratuito do Gemini está sujeito às cotas do Google. Pesquisa externa
com Search Grounding, potencialmente cobrada, **não é ativada**.

### Integridade e limitações

- Exatamente **uma obra ativa por vez**, com posicionamento de blocos a cada segundo.
- Lê terreno previamente carregado; não força carregamento/criação massiva de chunks.
- Rejeita locais próximos ao spawn, jogadores, obras anteriores e blocos
  incompatíveis com terreno natural. Só pode remover alguns blocos de solo
  natural e escavar galerias pequenas em locais isolados; ao detectar material
  desconhecido ou construção posterior, a obra é pausada, não demolida.
- A identificação de construções por inspeção é **conservadora, mas não infalível**
  quando uma obra usa exclusivamente blocos idênticos aos naturais. A fase
  futura deverá criar um registro autoritativo de blocos colocados por jogadores.
- Vila, castelo, moinho, ponte, pequena cidade, galeria, torre, jardim e portal
  são formas procedurais **iniciais**. **Moinhos ainda não giram; pontes ainda não
  se levantam; portais não transportam jogadores** nesta etapa.
- Progresso e obras concluídas são preservados em
  `gfc_npc_life_state` (MySQL + cópia privada JSON). Não editam nem limpam os
  dados existentes do mundo Minecraft no Chromium IndexedDB.

Para verificar o status na VPS:

```bash
curl -s http://127.0.0.1:4173/__npc/status | python3 -m json.tool
sudo journalctl -u games-for-children.service -f -o cat | grep --line-buffered -E 'NPC_(QUESTION|DECISION|STEP)'
```
