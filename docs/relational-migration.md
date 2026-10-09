# Etapa SQL 2 — migração relacional não destrutiva

**Estado atual:** a aplicação continua utilizando `game_state` como fonte primária. Este procedimento cria tabelas `gfc_*` e copia os dados existentes. **Não** ativa automaticamente a escrita relacional contínua, nem exclui `game_state`.

## Procedimento de manutenção (VPS, root)

1. Confirme que os dados estão acessíveis e que o backup é possível. Use sua senha MySQL somente no terminal, nunca na linha de comando.

```bash
install -d -m 700 /root/gamesforchildren-backups
mysqldump --single-transaction -u gamesuser -p gamesforchildren > /root/gamesforchildren-backups/gfc-$(date +%Y%m%d-%H%M%S).sql
```

2. Pare **apenas** o GamesForChildren para impedir mudanças simultâneas:

```bash
systemctl stop games-for-children.service
```

3. Carregue o ambiente já utilizado pelo serviço (esse arquivo precisa ter variáveis em formato seguro para Bash; não compartilhe sua saída):

```bash
set -a
. /etc/gamesforchildren.env
set +a
cd /home/gamesforchildren/apps/games-for-children
/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/node database/migrate.cjs
```

O comando acima mostra **somente quantidades**, não grava nada. Confira as quantidades antes de prosseguir.

4. Se a contagem estiver correta e o backup já estiver salvo, aplique:

```bash
/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/node database/migrate.cjs --apply
unset DB_PASSWORD
systemctl start games-for-children.service
```

5. Verifique o serviço e as tabelas:

```bash
systemctl is-active games-for-children.service
mysql -u gamesuser -p gamesforchildren -e "SHOW TABLES LIKE 'gfc_%'; SELECT COUNT(*) AS usuarios FROM gfc_users;"
```

**Importante:** o código acima contém variáveis com conteúdo confidencial, que não devem ser impressas em logs nem capturas. Não exclua `game_state`; ela permanece como recuperação. Para uso contínuo de tabelas relacionais será necessária uma segunda etapa com atualização transacional no código do aplicativo e migração definitiva das leituras.

As tabelas da projeção são `gfc_users`, `gfc_sessions`, `gfc_activity_events`, `gfc_matches`, `gfc_match_players`, `gfc_push_subscriptions` e `gfc_game_catalog`.
