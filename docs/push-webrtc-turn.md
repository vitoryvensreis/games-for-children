# Push e áudio WebRTC — preparação da VPS

A aplicação já recebe inscrições Push do **administrador**, envia alertas de presença, e disponibiliza a configuração ICE para as salas de voz. O WebRTC P2P permite até três participantes (Eric, Kauan e ADM), mas a conectividade real de voz precisa ser testada em cada rede.

## 1. VAPID para Web Push

Execute no terminal da VPS como root, **após o deploy instalar a dependência web-push**:

```bash
cd /home/gamesforchildren/apps/games-for-children
sudo -iu gamesforchildren bash -lc 'cd ~/apps/games-for-children && node -e "console.log(require(\"web-push\").generateVAPIDKeys())"'
```

Copie **separadamente** a chave pública e privada mostradas e guarde-as **somente** em `/etc/gamesforchildren.env`, sob root (modo 600), acrescentando:

```dotenv
VAPID_PUBLIC_KEY=SUBSTITUIR_PELA_CHAVE_PUBLICA
VAPID_PRIVATE_KEY=SUBSTITUIR_PELA_CHAVE_PRIVADA
VAPID_SUBJECT=mailto:seu-email@example.com
```

Use o seu e-mail real no `mailto:`. Não publique esse arquivo, nem envie os segredos em mensagens. Depois:

```bash
chmod 600 /etc/gamesforchildren.env
systemctl restart games-for-children.service
curl -fsS http://127.0.0.1:3100/api/health
```

No painel ADM, toque **Ativar notificações** para pedir permissão. No iPhone, primeiro adicione o site à Tela de Início e abra o ícone da PWA. No Android, permita notificações do navegador/PWA. O aparelho precisa aceitar Push. As notificações devem chegar com o painel fechado, sujeito às políticas do SO e à conectividade.

## 2. Coturn — voz em redes diferentes

Instalação sugerida, **somente com aprovação do administrador da VPS**, pois altera firewall e instala serviço:

```bash
apt update
apt install -y coturn
```

Configure `/etc/turnserver.conf` com valores **novos e secretos** (não reutilize PIN, chave SSH, VAPID ou senha ADM):

```ini
listening-ip=0.0.0.0
listening-port=3478
fingerprint
lt-cred-mech
realm=gamesforchildren.escotilhaprodutora.com
user=gamesvoice:SUBSTITUIR_SENHA_FORTE_ALEATORIA
external-ip=2.25.194.141
min-port=49160
max-port=49200
no-multicast-peers
no-cli
```

Depois, em `/etc/gamesforchildren.env`, como root, use o **mesmo** usuário e senha TURN:

```dotenv
TURN_URLS=turn:gamesforchildren.escotilhaprodutora.com:3478?transport=udp,turn:gamesforchildren.escotilhaprodutora.com:3478?transport=tcp
TURN_USERNAME=gamesvoice
TURN_PASSWORD=SUBSTITUIR_SENHA_FORTE_ALEATORIA
```

Habilite o serviço e libere **somente** as portas necessárias, se não houver regras equivalentes:

```bash
systemctl enable --now coturn
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 49160:49200/udp
systemctl restart games-for-children.service
```

Se existir firewall no provedor, libere as mesmas portas nele. Essas regras são para conexões de áudio WebRTC, **não** para o tráfego do site ou WebSocket. Para maior segurança/qualidade, depois substituiremos credenciais TURN estáticas por credenciais efêmeras e adicionaremos TURN sobre TLS, quando necessário.

## 3. Validação real de voz (pendente)

- Celular 1: perfil Eric, entrar na sala e ativar microfone.
- Celular 2: perfil Kauan, entrar pelo código, ativar microfone (idealmente um aparelho em dados móveis).
- ADM: entrar na sala pelo painel, ativar microfone.
- Checar áudio bidirecional dos três, consentimento do microfone, aviso de presença ADM, expulsão e bloqueio remoto de voz.
- Se falhar áudio, inspecionar `chrome://webrtc-internals` em um navegador Chromium desktop e logs do coturn.

> Não gravamos nem salvamos áudio. As mensagens WebSocket fazem apenas negociação de conexão. O acesso ao microfone depende de gesto e permissão de cada aparelho.
