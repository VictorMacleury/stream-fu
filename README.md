# 📺 Stream.fu

Site estático para transmitir sua tela ao vivo para amigos usando **WebRTC (PeerJS)**.
Os amigos **apenas assistem** — ninguém controla nem envia nada para a sua máquina.
Hospedável no **GitHub Pages** (só arquivos estáticos).

## Como funciona

- A captura da tela usa a API `getDisplayMedia()` do navegador.
- O vídeo vai **direto** de você para cada espectador (peer‑to‑peer, via WebRTC).
- A "apresentação" inicial entre os navegadores usa o **servidor público gratuito do PeerJS** (você não precisa manter servidor).

## Estrutura

```
stream-minha-tela/
├── index.html      # páginas: início, transmitir e assistir
├── css/style.css   # estilos
└── js/app.js       # lógica de transmissão e visualização
```

## Testar no seu computador

Só abrir o `index.html` no navegador já funciona (o Chrome permite captura de tela em `localhost`/arquivo local via HTTPS ou file). Se algo não funcionar localmente, rode um servidor simples:

```powershell
# Dentro da pasta do projeto
python -m http.server 8000
# Abra http://localhost:8000
```

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ex.: `stream-minha-tela`).
2. Envie estes arquivos para o repositório (pela interface do GitHub ou por git):
   ```powershell
   git init
   git add .
   git commit -m "Site de transmissão de tela"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/stream-minha-tela.git
   git push -u origin main
   ```
3. No GitHub, vá em **Settings → Pages**.
4. Em **Source**, escolha a branch **main** e a pasta **/ (root)**. Salve.
5. Aguarde ~1 minuto. Seu site ficará em:
   `https://SEU_USUARIO.github.io/stream-minha-tela/`

## Como usar

**Você (quem transmite):**
1. Abra o site e clique em **Transmitir minha tela**.
2. Escolha a tela/janela e permita a captura.
3. Copie o **código** ou o **link** e mande para os amigos.

**Seus amigos (quem assiste):**
1. Abrem o link (ou o site + **Assistir** e digitam o código).
2. O vídeo aparece sozinho. É só visualização.

## Limitações

- **Poucos espectadores** (ideal 2–5): cada um se conecta direto a você, então sua internet de **upload** é o limite.
- Em redes muito restritas, a conexão direta pode falhar. Nesses casos seria preciso um **servidor TURN** (pago ou auto‑hospedado) — não incluído aqui.
- Captura de tela funciona bem em **Chrome/Edge/Firefox no desktop**; em celular é limitada.
- O servidor público do PeerJS é gratuito e pode ter instabilidades. Para algo mais robusto, é possível hospedar seu próprio [PeerServer](https://github.com/peers/peerjs-server).
