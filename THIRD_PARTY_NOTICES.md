# Licenças de terceiros — GamesForChildren / Mundo de Blocos

O Mundo de Blocos utiliza **Three.js 0.186.1** para renderização WebGL 3D. O Three.js é distribuído sob a licença MIT:
https://github.com/mrdoob/three.js/blob/dev/LICENSE

**MIT License**

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

O pacote oficial, incluindo sua própria licença, é instalado via npm e servido localmente pelo servidor do GamesForChildren.

O repositório Refloow/Minecraft-Like-Voxel-Game (MIT) foi examinado como referência de viabilidade, mas **seu código não foi copiado** nesta primeira implementação. O cenário, controles, blocos, persistência e sincronização foram desenvolvidos para GamesForChildren. Nenhuma textura, áudio ou marca do Minecraft/Mojang/Microsoft foi incorporada.

## Limitações do primeiro MVP

- Mundo único e compartilhado para os perfis cadastrados, até 23 × 23 unidades de terreno.
- Alterações de blocos guardadas em game_state (MySQL, quando configurado) e espelhadas no arquivo JSON de estado local.
- Multiplayer de construção e posição via WebSocket existente.
- Não inclui mobs, crafting, sobrevivência, mundo infinito, física avançada ou chat de texto.
- Teste em aparelhos reais ainda necessário para validar FPS e compatibilidade WebGL.
