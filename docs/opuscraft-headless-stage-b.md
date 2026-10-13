# Etapa B — auditoria do protocolo real OpusCraft (em desenvolvimento)

Fonte examinada: Oppenheimerism/OpusCraft `bc0c753f730ef15bc8f8acf093d40797700b87ee`:
- `src/net/protocol.ts`: arrays de pacotes com IDs `SB` (guest → host) e `CB` (host → guest), empacotados por tick; validação de tipos via `checkPacket`.
- `src/net/config.ts`: `PROTOCOL_VERSION=8`, BUILD_ID gerado por Vite a partir do código, 20 TPS, até 7 convidados; limites de mensagens, chunks/tick e raio de visão.
- `src/net/server/hostServer.ts`: `HostServer` depende de `Level` e `HostHooks`, mas seu código é testável sem `window`; é o principal ponto de extração.
- `src/net/transport/webSocket.ts`: transport de host mantém um socket para todos os convidados e usa relay binário; a VPS atual **só encaminha bytes**.
- `src/game/game.ts`: `Game` mistura `Renderer`, `Input`, `TouchControls`, áudio e `Level`. Instanciar Game na VPS repetiria o problema antigo.

Arquivos adicionados:
- `ops/opuscraft-headless/protocol-contract.cjs`: espelho parcial auditado do protocolo com validação de handshake e priorização de chunks próximos.
- `tests/opuscraft-protocol-contract.cjs`: contratos e limites.

## Decisão arquitetural
**Não inventar um segundo protocolo de blocos para o cliente.** A simulação deve reutilizar `Level`, `HostServer`, geração de chunks, regras e serialização do código upstream. O snapshot simplificado da fase A é apenas um protótipo e **não** deve persistir dados reais sem conversão/validação compatível.

Plano seguinte:
1. Adicionar build Node do upstream e smoke de importação headless de `Level`/`HostServer`; corrigir importações que acessarem `window`/WebGL ao carregar.
2. Implementar `HostHooks` sem interface e tick loop autoritativo a 20 TPS, com orçamento de CPU e desligamento seguro.
3. Ligar `HostServer` ao relay existente usando transporte já definido no upstream; handshake deve exigir protocolo, BUILD_ID, identidade autenticada e limites.
4. Persistir chunks/jogadores com `worldStore` real, migrado para storage de servidor; teste de queda/reinicio e backup verificável.
5. Só então oferecer modo dedicado 24h atrás de feature flag; sem modificar o mundo player-hosted da produção.

**Estado atual:** ainda não há mundo multiplayer 24h funcional. Branch experimental; não publicar automaticamente.

## Integração real adicionada nesta rodada
O smoke experimental agora instancia as classes reais `World` e `Level` e chama quatro vezes `Level.tick()` num bundle Node. O teste só será considerado aprovado quando o GitHub Actions reportar sucesso; importar os módulos, sozinho, não seria prova suficiente. Não há servidor de mundo ou suporte multiplayer dedicado publicado nesta etapa.
