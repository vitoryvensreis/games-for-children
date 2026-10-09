# Integração ClassiCube + MCGalaxy — preparação

## Estado em 2026-10-09

GamesForChildren possui a opção **Testar ClassiCube (externo)** no painel ADM. Ela abre o cliente oficial em uma aba separada, sem transmitir senhas, cookies ou dados infantis para o cliente externo.

**Não há servidor MCGalaxy privado instalado ou validado por este repositório neste momento.**
O modo externo não compartilha o login dos perfis infantis, o contador de tempo ou os mundos atuais do GamesForChildren.

## Fontes oficiais

- Cliente e integração: https://github.com/ClassiCube/ClassiCube/blob/master/doc/hosting-webclient.md
- Servidor multiplayer: https://github.com/ClassiCube/MCGalaxy
- Cliente web oficial: https://www.classicube.net/server/play/
- Licenças: consultar os arquivos LICENSE e LICENSE.txt dos repositórios (MCGalaxy: GPL-3.0 e arquivos com licenças próprias).

## O que falta para um servidor realmente privado

1. Criar um serviço independente MCGalaxy na VPS, sem alterar o serviço Node.js atual nem o banco do GamesForChildren. Verificar previamente memória, backup e portas disponíveis.
2. Configurar mundo persistente, listas permitidas, funções administrativas, limites de acesso e desativar a publicidade/listagem pública. Não disponibilizar acesso a desconhecidos.
3. Preparar o cliente web autohospedado, com seus arquivos e licenças, seguindo a documentação oficial.
4. Expor o serviço por **WSS** seguro e validar a compatibilidade do proxy WebSocket (o cliente clássico não acessa diretamente um socket TCP de uma página HTTPS).
5. Criar um proxy de autenticação/autorização integrado aos perfis e limites parentais atuais. Nunca enviar senha/pin infantil para ClassiCube nem confiar apenas no nome de usuário fornecido no navegador.
6. Validar touch e FPS no iPhone e Android, reconexão, backups e remoção de acesso quando o ADM desabilita uma conta.
7. Só então mostrar o jogo no catálogo infantil. Até lá, a prévia externa ficará exclusiva no ADM.

Não automatizar instalação de Mono, abertura de firewall e mudança de Nginx no workflow de deploy existente: são operações de infraestrutura separadas, com necessidade de testes e rollback próprio.
