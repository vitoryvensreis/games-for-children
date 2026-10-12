# OpusCraft 24h — Fase A (fundação isolada)
Status: protótipo **NÃO implantado** e **NÃO compatível ainda** com o cliente upstream.

## Objetivo
Migrar do modelo player-hosted para mundo persistente em processo Node sem Chromium, mantendo WebGL2 e controles no navegador dos jogadores e o voice dock na aplicação principal.

## Implementado nesta branch
- `ops/opuscraft-headless/world.cjs`: estado independente de browser, seed persistida, revisões de blocos, chunks de 16×16, posição de jogadores em memória, snapshot atômico.
- `tests/opuscraft-headless.cjs`: testes de persistência, coordenadas negativas, validação, corrupção e ausência de dependência gráfica.
- Nenhuma mudança de deploy, da VPS, de `main` ou dos mundos atuais.

## NÃO implementado (bloqueadores)
1. Auditar tipos de chunk, paleta de blocos, seed/gerador e serialização reais do OpusCraft na revisão fixada `bc0c753f730ef15bc8f8acf093d40797700b87ee`.
2. Extrair física e tick do cliente, remover dependências de DOM/WebGL, adicionar inventário, mobs e ciclo dia/noite.
3. Definir adaptador de rede com autenticação de sessão parental, replay/resume, ack, rate limit, validação de distância, conflito, backpressure e interest management.
4. Sincronizar chunks para o renderer existente, mantendo o protocolo upstream isolado; teste real com 2 navegadores e mobile.
5. Snapshot + journal durável, backup/restore testados, migração de mapa, bounds e limites de escrita.
6. Novo serviço systemd separado com CPU/RAM limitadas e health checks; canary sem troca automática de produção.

## Execução local
```bash
node --check ops/opuscraft-headless/world.cjs
node --test tests/opuscraft-headless.cjs
```

**Atenção:** não conectar diretamente esse protótipo a usuários externos, nem confundir o snapshot de modificações com formato de mundo do OpusCraft. O cliente original continua usando o anfitrião até a integração completa.
