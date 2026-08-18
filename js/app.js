// ==========================================================================
// Transmita sua tela — WebRTC (PeerJS) screen streaming, view-only.
// O host captura a tela e envia o vídeo direto para cada espectador.
// Os espectadores apenas recebem: nunca enviam áudio, vídeo ou dados.
// ==========================================================================

// STUN ajuda os navegadores a se acharem; TURN faz relay quando a rede é fechada.
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: [
          "turn:eu-0.turn.peerjs.com:3478",
          "turn:us-0.turn.peerjs.com:3478"
        ],
        username: "peerjs",
        credential: "peerjsp"
      }
    ]
  }
};

// ---- Referências de elementos ----
const views = {
  home: document.getElementById("home"),
  host: document.getElementById("host"),
  viewer: document.getElementById("viewer")
};

const roomCodeEl = document.getElementById("roomCode");
const hostStatusEl = document.getElementById("hostStatus");
const hostPreviewEl = document.getElementById("hostPreview");
const viewerCountEl = document.getElementById("viewerCount");
const btnChangeSource = document.getElementById("btnChangeSource");
const startPriority = document.getElementById("startPriority");

const codeInputEl = document.getElementById("codeInput");
const viewerStatusEl = document.getElementById("viewerStatus");
const viewerVideoEl = document.getElementById("viewerVideo");
const joinRowEl = document.getElementById("joinRow");
const btnFullscreen = document.getElementById("btnFullscreen");
const prioritySelect = document.getElementById("prioritySelect");
const soundControls = document.getElementById("soundControls");
const btnToggleSound = document.getElementById("btnToggleSound");
const volumeSlider = document.getElementById("volumeSlider");
const audioHintEl = document.getElementById("audioHint");

// Cada modo define como o codificador reage quando falta banda.
const PRIORITY_SETTINGS = {
  framerate: {
    degradationPreference: "maintain-framerate", // baixa resolução p/ manter FPS
    contentHint: "motion",
    maxFramerate: 60,
    maxBitrate: 8_000_000
  },
  balanced: {
    degradationPreference: "balanced",
    contentHint: "motion",
    maxFramerate: 60,
    maxBitrate: 6_000_000
  },
  resolution: {
    degradationPreference: "maintain-resolution", // baixa FPS p/ manter nitidez
    contentHint: "detail",
    maxFramerate: 30,
    maxBitrate: 8_000_000
  }
};

// ---- Estado ----
let hostPeer = null;
let viewerPeer = null;
let localStream = null;
let currentPriority = "framerate";
const viewerCalls = new Map(); // viewerId -> MediaConnection ativa

// ---- Navegação entre telas ----
function showView(name) {
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

// ---- Utilidades ----
function generateCode() {
  // Sem 0/O/1/I para evitar confusão ao digitar.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function buildViewerLink(code) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "?code=" + code;
  return url.toString();
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = "Copiado!";
    setTimeout(() => (btn.textContent = original), 1500);
  });
}

// ==========================================================================
// HOST — captura a tela e transmite
// ==========================================================================

// Pede a captura de tela com os mesmos parâmetros ao iniciar e ao trocar a fonte.
function captureScreen() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 } },
    // Desliga processamentos de voz para não degradar música/áudio do sistema.
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
}

async function startHosting() {
  // A prioridade escolhida no card vale desde o início.
  currentPriority = startPriority.value;
  prioritySelect.value = startPriority.value;

  showView("host");
  hostStatusEl.textContent = "Pedindo permissão para capturar a tela…";

  try {
    localStream = await captureScreen();
  } catch (err) {
    hostStatusEl.textContent =
      "❌ Captura cancelada ou não permitida pelo navegador.";
    return;
  }

  hostPreviewEl.srcObject = localStream;
  prepareVideoTrack(localStream.getVideoTracks()[0]);

  createHostPeer(generateCode());
}

// Aplica o contentHint da prioridade e encerra tudo se a captura terminar.
function prepareVideoTrack(track) {
  if ("contentHint" in track) {
    track.contentHint = PRIORITY_SETTINGS[currentPriority].contentHint;
  }
  track.addEventListener("ended", stopHosting);
}

// Troca a tela/janela transmitida sem derrubar a sala nem gerar novo código.
async function changeSource() {
  let newStream;
  try {
    newStream = await captureScreen();
  } catch (err) {
    return; // usuário cancelou a troca
  }

  const newVideoTrack = newStream.getVideoTracks()[0];
  const newAudioTrack = newStream.getAudioTracks()[0] || null;
  if ("contentHint" in newVideoTrack) {
    newVideoTrack.contentHint = PRIORITY_SETTINGS[currentPriority].contentHint;
  }

  // Substitui as faixas em cada espectador conectado (sem renegociar).
  viewerCalls.forEach((call) => {
    const pc = call.peerConnection;
    if (!pc) return;
    const videoSender = pc
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");
    if (videoSender) videoSender.replaceTrack(newVideoTrack).catch(() => {});
    const audioSender = pc
      .getSenders()
      .find((s) => s.track && s.track.kind === "audio");
    if (audioSender && newAudioTrack) {
      audioSender.replaceTrack(newAudioTrack).catch(() => {});
    }
  });

  // Adota o novo stream e encerra o anterior.
  const oldStream = localStream;
  localStream = newStream;
  hostPreviewEl.srcObject = localStream;
  if (oldStream) oldStream.getTracks().forEach((t) => t.stop());

  newVideoTrack.addEventListener("ended", stopHosting);
  hostStatusEl.textContent =
    "✅ Fonte trocada! Continua no ar com o mesmo código.";
}

function createHostPeer(code) {
  hostPeer = new Peer(code, PEER_CONFIG);

  hostPeer.on("open", (id) => {
    roomCodeEl.textContent = id;
    hostStatusEl.textContent = "✅ No ar! Envie o código para seus amigos.";
  });

  // Cada espectador se anuncia por uma conexão de dados; então nós o chamamos.
  hostPeer.on("connection", (conn) => {
    conn.on("open", () => callViewer(conn.peer));
    conn.on("close", () => {
      viewerCalls.delete(conn.peer);
      updateViewerCount();
    });
  });

  hostPeer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      createHostPeer(generateCode()); // colisão de código: gera outro
    } else {
      hostStatusEl.textContent = "⚠️ Erro de conexão: " + err.type;
    }
  });
}

function callViewer(viewerId) {
  if (!localStream) return;
  const call = hostPeer.call(viewerId, localStream);
  viewerCalls.set(viewerId, call);
  updateViewerCount();
  tuneCall(call);
  call.on("close", () => {
    viewerCalls.delete(viewerId);
    updateViewerCount();
  });
}

// Aguarda a conexão ficar pronta e aplica a prioridade atual ao remetente.
function tuneCall(call) {
  const setup = () => {
    const pc = call.peerConnection;
    if (!pc) {
      setTimeout(setup, 300);
      return;
    }
    const apply = () => {
      applyPriorityToSender(pc);
      boostAudio(pc);
    };
    if (pc.connectionState === "connected") apply();
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") apply();
    });
  };
  setup();
}

// Ajusta um remetente WebRTC conforme a prioridade escolhida.
function applyPriorityToSender(pc) {
  const s = PRIORITY_SETTINGS[currentPriority];
  const sender = pc
    .getSenders()
    .find((x) => x.track && x.track.kind === "video");
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.degradationPreference = s.degradationPreference;
  params.encodings[0].maxFramerate = s.maxFramerate;
  params.encodings[0].maxBitrate = s.maxBitrate;
  sender.setParameters(params).catch(() => {});
}

// Aumenta o bitrate do áudio para música/áudio do sistema soar melhor.
function boostAudio(pc) {
  const sender = pc
    .getSenders()
    .find((x) => x.track && x.track.kind === "audio");
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = 128_000; // ~128 kbps
  sender.setParameters(params).catch(() => {});
}

// Troca a prioridade ao vivo e reaplica em todos os espectadores conectados.
function setPriority(value) {
  currentPriority = value;
  const s = PRIORITY_SETTINGS[value];
  if (localStream) {
    const track = localStream.getVideoTracks()[0];
    if (track && "contentHint" in track) track.contentHint = s.contentHint;
  }
  viewerCalls.forEach((call) => {
    const pc = call.peerConnection;
    if (pc && pc.connectionState === "connected") applyPriorityToSender(pc);
  });
}

function updateViewerCount() {
  const n = viewerCalls.size;
  viewerCountEl.textContent =
    n === 1 ? "1 pessoa assistindo" : n + " pessoas assistindo";
}

function stopHosting() {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (hostPeer) {
    hostPeer.destroy();
    hostPeer = null;
  }
  viewerCalls.clear();
  hostPreviewEl.srcObject = null;
  roomCodeEl.textContent = "------";
  showView("home");
}

// ==========================================================================
// VIEWER — recebe e assiste (nunca envia nada)
// ==========================================================================
function startViewing(prefillCode) {
  showView("viewer");
  if (prefillCode) codeInputEl.value = prefillCode;
}

function connectToHost() {
  const code = codeInputEl.value.trim().toUpperCase();
  if (!code) {
    viewerStatusEl.textContent = "Digite um código válido.";
    return;
  }

  viewerStatusEl.textContent = "Conectando…";
  viewerPeer = new Peer(PEER_CONFIG); // ID aleatório para o espectador

  viewerPeer.on("open", () => {
    // Anuncia presença ao host para que ele nos envie o vídeo.
    const conn = viewerPeer.connect(code);
    conn.on("open", () => {
      viewerStatusEl.textContent = "Conectado! Aguardando o vídeo…";
    });
  });

  // O host nos liga com o vídeo da tela.
  viewerPeer.on("call", (call) => {
    call.answer(); // apenas visualização: não enviamos nada de volta
    call.on("stream", (remoteStream) => {
      viewerVideoEl.srcObject = remoteStream;
      viewerStatusEl.textContent = "🔴 Ao vivo";
      joinRowEl.classList.add("hidden");
      btnFullscreen.classList.remove("hidden");
      setupViewerAudio(remoteStream);
    });
    call.on("close", () => {
      viewerStatusEl.textContent = "A transmissão foi encerrada.";
      viewerVideoEl.srcObject = null;
      soundControls.classList.add("hidden");
    });
  });

  viewerPeer.on("error", (err) => {
    if (err.type === "peer-unavailable") {
      viewerStatusEl.textContent =
        "❌ Código não encontrado. Confirme com seu amigo se a transmissão está ativa.";
    } else {
      viewerStatusEl.textContent = "⚠️ Erro: " + err.type;
    }
  });
}

// Configura o áudio para quem assiste: começa mudo (garante o autoplay) e mostra
// o controle para ativar o som e ajustar o volume.
function setupViewerAudio(stream) {
  const hasAudio = stream.getAudioTracks().length > 0;
  soundControls.classList.remove("hidden");
  viewerVideoEl.muted = true;
  viewerVideoEl.volume = volumeSlider.value / 100;
  viewerVideoEl.play().catch(() => {});
  updateSoundButton();
  audioHintEl.textContent = hasAudio
    ? 'Clique em "Ativar som" para ouvir.'
    : 'Esta transmissão está sem áudio (o transmissor não marcou "compartilhar áudio").';
}

function toggleSound() {
  viewerVideoEl.muted = !viewerVideoEl.muted;
  if (!viewerVideoEl.muted && viewerVideoEl.volume === 0) {
    viewerVideoEl.volume = 0.8;
    volumeSlider.value = 80;
  }
  viewerVideoEl.play().catch(() => {});
  updateSoundButton();
}

function updateSoundButton() {
  const silent = viewerVideoEl.muted || viewerVideoEl.volume === 0;
  btnToggleSound.textContent = silent ? "🔇 Ativar som" : "🔊 Som ligado";
  btnToggleSound.classList.toggle("primary", silent);
  btnToggleSound.classList.toggle("ghost", !silent);
}

function leaveViewer() {
  if (viewerPeer) {
    viewerPeer.destroy();
    viewerPeer = null;
  }
  viewerVideoEl.srcObject = null;
  joinRowEl.classList.remove("hidden");
  btnFullscreen.classList.add("hidden");
  soundControls.classList.add("hidden");
  viewerStatusEl.textContent = "Digite o código do seu amigo para começar.";
  showView("home");
}

// ==========================================================================
// Ligações de eventos
// ==========================================================================
document.getElementById("btnGoHost").addEventListener("click", startHosting);
document.getElementById("btnGoViewer").addEventListener("click", () => startViewing());
document.getElementById("btnStopHost").addEventListener("click", stopHosting);
document.getElementById("btnBackHome1").addEventListener("click", stopHosting);
btnChangeSource.addEventListener("click", changeSource);
document.getElementById("btnConnect").addEventListener("click", connectToHost);
document.getElementById("btnBackHome2").addEventListener("click", leaveViewer);

document.getElementById("btnCopyCode").addEventListener("click", (e) =>
  copyText(roomCodeEl.textContent, e.currentTarget)
);
document.getElementById("btnCopyLink").addEventListener("click", (e) =>
  copyText(buildViewerLink(roomCodeEl.textContent), e.currentTarget)
);

btnFullscreen.addEventListener("click", () => {
  if (viewerVideoEl.requestFullscreen) viewerVideoEl.requestFullscreen();
});

codeInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") connectToHost();
});

prioritySelect.addEventListener("change", (e) => setPriority(e.target.value));

btnToggleSound.addEventListener("click", toggleSound);
volumeSlider.addEventListener("input", () => {
  viewerVideoEl.volume = volumeSlider.value / 100;
  viewerVideoEl.muted = volumeSlider.value === "0";
  updateSoundButton();
});
viewerVideoEl.addEventListener("volumechange", updateSoundButton);

// Abre direto no modo espectador quando o link tem ?code=XXXXXX
const codeParam = new URLSearchParams(window.location.search).get("code");
if (codeParam) startViewing(codeParam.toUpperCase());
