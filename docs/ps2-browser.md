# GTA San Andreas — laboratório experimental PS2

A rota `/ps2/index.html` é protegida **no servidor** para sessões com perfil `admin` e usa WebAssembly / WebGL2. A interface oferece gamepad, touch, fullscreen e seleção de imagem ISO, CHD, CSO, ISZ ou BIN **local**. Nenhum jogo ou BIOS vem no código. Não disponibilizar este jogo adulto aos perfis infantis.

## Runtime
O script `ops/install-ps2-runtime.sh` baixa somente `Play.js`, `Play.wasm` e a licença BSD do emulador oficial Play! e verifica SHA-256 da versão conhecida em 15/10/2026. Se a fonte publicar uma versão diferente, o script falhará até uma nova auditoria de checksums. A etapa de deploy executa o instalador antes de empacotar o release. Também pode ser executado manualmente em uma cópia autorizada:
```bash
bash ops/install-ps2-runtime.sh
node --check public/ps2/app.js
node --test tests/ps2-access.cjs
```
O script depende de rede externa, e os binários grandes não são versionados no Git.

## Fluxo de validação
1. Sem sessão: `GET /ps2/index.html` e `GET /ps2/emulator/Play.wasm` precisam retornar HTTP 401.
2. Com sessão infantil: ambos precisam retornar HTTP 403.
3. Com ADM: HTTP 200 com `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` e `Cross-Origin-Resource-Policy: same-origin`; a navegação é top-level.
4. Abra DevTools > Network: a imagem local nunca pode sair do aparelho por HTTP.
5. Selecione uma imagem obtida legitimamente e valide boot, controles, som e missões em Chrome/Edge e Android; iPhone ainda precisa de teste próprio.
6. Confira console/log quando a imagem não iniciar; o Play!.js não garante compatibilidade nem velocidade do GTA San Andreas.

## Limites
Não há upload de jogo à VPS, download de mídia comercial, save sincronizado ou promessa de compatibilidade. O progresso pode se perder ao limpar dados do navegador. A integração está isolada e não modifica Pong, Cobrinha ou OpusCraft. Não execute o script antigo de deploy manualmente sem revisar as rotinas de preservação de mundos.

Fontes: https://github.com/jpd002/Play- • https://playjs.purei.org/ • https://github.com/jpd002/Play-Compatibility
