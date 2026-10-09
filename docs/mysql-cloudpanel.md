# Ativar MySQL com segurança

O aplicativo usa `mysql2`, mantém um backup em `data/state.json` e importa o estado local para a tabela MySQL `game_state` ao primeiro início com credenciais válidas.

**Antes de começar:** conclua a criação do banco de dados no CloudPanel. Como a senha apareceu em uma captura de tela, altere-a primeiro no painel e guarde o novo valor em um gerenciador de senhas. Nunca a publique no GitHub ou em chats.

## 1. Backup sem interromper o serviço
Entre na VPS como root:
```bash
install -d -m 700 /root/gamesforchildren-backups
cp -a /home/gamesforchildren/apps/games-for-children/data/state.json /root/gamesforchildren-backups/state-$(date +%Y%m%d-%H%M%S).json
```
Se o arquivo não existir, não ative a integração sem verificar o local atual dos dados.

## 2. Configurar as credenciais somente na VPS

```bash
nano /etc/gamesforchildren.env
```

Adicione, mantendo as configurações existentes:
```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=gamesforchildren
DB_USER=gamesuser
DB_PASSWORD=COLE_A_SENHA_NOVA_AQUI
```
Não coloque aspas no valor (a menos que siga a sintaxe de arquivos systemd EnvironmentFile). Evite espaços ou caracteres que precisam de escape nos valores. A senha será armazenada somente nesse arquivo protegido.

```bash
chmod 600 /etc/gamesforchildren.env
systemctl restart games-for-children.service
systemctl is-active games-for-children.service
curl -fsS http://127.0.0.1:3100/api/health
```

Verifique os logs (não compartilhe tokens, PINs ou senhas):
```bash
journalctl -u games-for-children.service -n 30 --no-pager
```

A mensagem de inicialização deve indicar **Persistência MySQL**.

## 3. Verificar a migração
Verifique no CloudPanel se a tabela `game_state` foi criada. A primeira execução importa o estado existente. Cadastre um perfil de teste no ADM, reinicie somente o serviço GamesForChildren e confirme que ele permanece disponível.

O modelo inicial usa **uma linha JSON no MySQL**, adequado apenas para esta fase familiar de uso leve. Planeja-se migrar para tabelas relacionais `users`, `sessions`, `matches`, `scores`, `push_subscriptions` e `activity_events`. Não apague o arquivo `data/state.json` antes da migração definitiva.

## Observação de segurança
O arquivo `/etc/gamesforchildren.env` contém segredos, acessíveis somente a root. Não execute comandos que imprimam seu conteúdo ao solicitar suporte.
