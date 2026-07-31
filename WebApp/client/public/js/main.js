import { getServerConfig, getRTCConfiguration } from "./config.js";
import { createDisplayStringArray } from "./stats.js";
import { VideoPlayer } from "./videoplayer.js";
import { RenderStreaming } from "../module/renderstreaming.js";
import { Signaling, WebSocketSignaling } from "../module/signaling.js";

/** @type {Element} */
let playButton;
/** @type {RenderStreaming} */
let renderstreaming;
/** @type {boolean} */
let useWebSocket;

const playerDiv = document.getElementById('player');
const warningDiv = document.getElementById('warning');
const messageDiv = document.getElementById('message');
const videoPlayer = new VideoPlayer();

// Which Unity app to receive from, e.g. /?app=antigone. The name is the signaling room the
// Unity app was launched with; without it we join the default room.
const searchParams = new URLSearchParams(location.search);
const appName = searchParams.get('app') || searchParams.get('room') || null;
const appNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

// Connection stats are opt-in so the page stays a bare player, e.g. /?app=antigone&stats=1
const withStats = searchParams.get('stats') === '1';

setup();

window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('beforeunload', async () => {
  if (!renderstreaming)
    return;
  await renderstreaming.stop();
}, true);

async function setup() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;

  if (res.startupMode == "private") {
    showError('The signaling server is running in private mode. Restart it with "-m public".');
    return;
  }
  if (!checkAppName()) {
    return;
  }
  showPlayButton();
}

/**
 * @returns {boolean} false when the requested app can't be reached, so setup should stop.
 */
function checkAppName() {
  if (appName == null) {
    return true;
  }
  if (!appNamePattern.test(appName)) {
    showError('Invalid app name. Use 1-64 characters out of A-Z, a-z, 0-9, "-" and "_".');
    return false;
  }
  if (!useWebSocket) {
    showError('Receiving from a named app needs the websocket signaling server. Restart the WebApp without "-t http".');
    return false;
  }

  document.title = `Receiver - ${appName}`;
  return true;
}

function showError(message) {
  const header = document.createElement('h4');
  header.innerText = 'Error';
  const text = document.createElement('span');
  text.innerText = message;
  warningDiv.appendChild(header);
  warningDiv.appendChild(text);
  warningDiv.hidden = false;
}

function showPlayButton() {
  if (!document.getElementById('playButton')) {
    const elementPlayButton = document.createElement('img');
    elementPlayButton.id = 'playButton';
    elementPlayButton.src = 'images/Play.png';
    elementPlayButton.alt = 'Start Streaming';
    playButton = playerDiv.appendChild(elementPlayButton);
    playButton.addEventListener('click', onClickPlayButton);
  }
}

function onClickPlayButton() {
  playButton.style.display = 'none';

  // add video player
  videoPlayer.createPlayer(playerDiv);
  setupRenderStreaming();
}

async function setupRenderStreaming() {
  const signaling = useWebSocket ? new WebSocketSignaling(1000, appName) : new Signaling();
  const config = getRTCConfiguration();
  renderstreaming = new RenderStreaming(signaling, config);
  renderstreaming.onConnect = onConnect;
  renderstreaming.onDisconnect = onDisconnect;
  renderstreaming.onTrackEvent = (data) => videoPlayer.addTrack(data.track);

  await renderstreaming.start();
  await renderstreaming.createConnection();
}

function onConnect() {
  // This page only receives, so opening a data channel is what raises negotiationneeded and
  // gets our offer sent. Without it Unity is never asked for the stream.
  renderstreaming.createDataChannel("input");

  if (withStats) {
    showStatsMessage();
  }
}

async function onDisconnect() {
  clearStatsMessage();

  await renderstreaming.stop();
  renderstreaming = null;
  videoPlayer.deletePlayer();
  showPlayButton();
}

/** @type {RTCStatsReport} */
let lastStats;
/** @type {number} */
let intervalId;

function showStatsMessage() {
  intervalId = setInterval(async () => {
    if (renderstreaming == null) {
      return;
    }

    const stats = await renderstreaming.getStats();
    if (stats == null) {
      return;
    }

    const array = createDisplayStringArray(stats, lastStats);
    if (array.length) {
      messageDiv.hidden = false;
      messageDiv.innerHTML = array.join('<br>');
    }
    lastStats = stats;
  }, 1000);
}

function clearStatsMessage() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  lastStats = null;
  intervalId = null;
  messageDiv.hidden = true;
  messageDiv.innerHTML = '';
}
