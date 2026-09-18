import { jest } from '@jest/globals';
import * as Path from 'path';
import { setup, teardown } from 'jest-dev-server';
import { Signaling, WebSocketSignaling } from "../src/signaling.js";
import { MockSignaling, reset } from "./mocksignaling.js";
import { waitFor, sleep, serverExeName } from "./testutils.js";

const portNumber = 8081;
jest.setTimeout(10000);

describe.each([
  { mode: "mock" },
  { mode: "http" },
  { mode: "websocket" },
])('signaling test in public mode', ({ mode }) => {
  let signaling1;
  let signaling2;
  const connectionId1 = "12345";
  const connectionId2 = "67890";
  const testsdp = "test sdp";
  const testcandidate = "test candidate";

  beforeAll(async () => {
    if (mode == "mock") {
      reset(false);
      signaling1 = new MockSignaling(1);
      signaling2 = new MockSignaling(1);
    } else {
      const path = Path.resolve(`../bin~/${serverExeName()}`);
      let cmd = `${path} -p ${portNumber}`;
      if (mode == "http") {
        cmd += " -t http";
      }

      await setup({ command: cmd, port: portNumber, usedPortAction: 'error' });

      if (mode == "http") {
        signaling1 = new Signaling(1);
        signaling2 = new Signaling(1);
      }

      if (mode == "websocket") {
        signaling1 = new WebSocketSignaling(1);
        signaling2 = new WebSocketSignaling(1);
      }
    }

    await signaling1.start();
    await signaling2.start();
  });

  afterAll(async () => {
    await signaling1.stop();
    await signaling2.stop();
    signaling1 = null;
    signaling2 = null;

    if (mode == "mock") {
      return;
    }

    await teardown();
    // work around for linux, waitng kill server process
    await sleep(1000);
  });

  test(`onConnect using ${mode}`, async () => {
    const signaling1Spy = jest.spyOn(signaling1, 'dispatchEvent');
    let connectRes;
    let disconnectRes;
    signaling1.addEventListener('connect', (e) => connectRes = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes = e.detail);

    await signaling1.createConnection(connectionId1);
    await waitFor(() => connectRes != null);
    expect(connectRes.connectionId).toBe(connectionId1);
    expect(connectRes.polite).toBe(true);

    await signaling1.deleteConnection(connectionId1);
    await waitFor(() => disconnectRes != null);
    expect(disconnectRes.connectionId).toBe(connectionId1);

    const disconnectCalledCount = signaling1Spy.mock.calls.map(x => x[0].type).filter(x => x == "disconnect").length;
    expect(disconnectCalledCount).toBe(1);

    signaling1Spy.mockRestore();
  });

  test(`onOffer using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);

    await signaling1.createConnection(connectionId1);
    await signaling2.createConnection(connectionId2);
    await waitFor(() => connectRes1 != null && connectRes2 != null);
    expect(connectRes1.connectionId).toBe(connectionId1);
    expect(connectRes2.connectionId).toBe(connectionId2);

    await signaling1.sendOffer(connectionId1, testsdp);
    await waitFor(() => offerRes2 != null);
    expect(offerRes2.connectionId).toBe(connectionId1);
    expect(offerRes2.polite).toBe(false);

    await signaling1.deleteConnection(connectionId1);
    await waitFor(() => disconnectRes1 != null);
    expect(disconnectRes1.connectionId).toBe(connectionId1);
    await signaling2.deleteConnection(connectionId2);
    await waitFor(() => disconnectRes2 != null);
    expect(disconnectRes2.connectionId).toBe(connectionId2);
  });

  test(`onAnswer using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    let answerRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);
    signaling1.addEventListener('answer', (e) => answerRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);

    await signaling1.createConnection(connectionId1);
    await signaling2.createConnection(connectionId2);
    await waitFor(() => connectRes1 != null && connectRes2 != null);

    await signaling1.sendOffer(connectionId1, testsdp);
    await waitFor(() => offerRes2 != null);
    expect(offerRes2.connectionId).toBe(connectionId1);
    expect(offerRes2.sdp).toBe(testsdp);

    signaling2.sendAnswer(connectionId1, testsdp);
    await waitFor(() => answerRes1 != null);
    expect(answerRes1.connectionId).toBe(connectionId1);
    expect(answerRes1.sdp).toBe(testsdp);

    await signaling1.deleteConnection(connectionId1);
    await waitFor(() => disconnectRes1 != null);
    await signaling2.deleteConnection(connectionId2);
    await waitFor(() => disconnectRes2 != null);
  });

  test(`onCandidate using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    let answerRes1;
    let candidateRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);
    signaling1.addEventListener('answer', (e) => answerRes1 = e.detail);
    signaling1.addEventListener('candidate', (e) => candidateRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    let candidateRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);
    signaling2.addEventListener('candidate', (e) => candidateRes2 = e.detail);

    await signaling1.createConnection(connectionId1);
    await signaling2.createConnection(connectionId2);
    await waitFor(() => connectRes1 != null && connectRes2 != null);

    await signaling1.sendOffer(connectionId1, testsdp);
    await waitFor(() => offerRes2 != null);
    expect(offerRes2.connectionId).toBe(connectionId1);
    expect(offerRes2.sdp).toBe(testsdp);

    signaling2.sendAnswer(connectionId1, testsdp);
    await waitFor(() => answerRes1 != null);
    expect(answerRes1.connectionId).toBe(connectionId1);
    expect(answerRes1.sdp).toBe(testsdp);

    await signaling2.sendCandidate(connectionId1, testcandidate, 1, 1);
    await waitFor(() => candidateRes1 != null);
    expect(candidateRes1.connectionId).toBe(connectionId1);
    expect(candidateRes1.candidate).toBe(testcandidate);
    expect(candidateRes1.sdpMid).toBe(1);
    expect(candidateRes1.sdpMLineIndex).toBe(1);

    await signaling1.sendCandidate(connectionId1, testcandidate, 1, 1);
    await waitFor(() => candidateRes2 != null);
    expect(candidateRes2.connectionId).toBe(connectionId1);
    expect(candidateRes2.candidate).toBe(testcandidate);
    expect(candidateRes2.sdpMid).toBe(1);
    expect(candidateRes2.sdpMLineIndex).toBe(1);

    await signaling1.deleteConnection(connectionId1);
    await waitFor(() => disconnectRes1 != null);
    await signaling2.deleteConnection(connectionId2);
    await waitFor(() => disconnectRes2 != null);
  });
});

describe.each([
  { mode: "mock" },
  { mode: "http" },
  { mode: "websocket" },
])('signaling test in private mode', ({ mode }) => {
  let signaling1;
  let signaling2;
  const connectionId = "12345";
  const testsdp = "test sdp";
  const testcandidate = "test candidate";

  beforeAll(async () => {
    if (mode == "mock") {
      reset(true);
      signaling1 = new MockSignaling(1);
      signaling2 = new MockSignaling(1);
      return;
    }

    const path = Path.resolve(`../bin~/${serverExeName()}`);
    let cmd = `${path} -p ${portNumber} -m private`;
    if (mode == "http") {
      cmd += " -t http";
    }

    await setup({ command: cmd, port: portNumber, usedPortAction: 'error' });

    if (mode == "http") {
      signaling1 = new Signaling(1);
      signaling2 = new Signaling(1);
    }

    if (mode == "websocket") {
      signaling1 = new WebSocketSignaling(1);
      signaling2 = new WebSocketSignaling(1);
    }

    await signaling1.start();
    await signaling2.start();
  });

  afterAll(async () => {
    await signaling1.stop();
    await signaling2.stop();
    signaling1 = null;
    signaling2 = null;

    if (mode == "mock") {
      return;
    }

    await teardown();
    // work around for linux, waitng kill server process
    await sleep(1000);
  });

  test(`onConnect using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);

    await signaling1.createConnection(connectionId);
    await waitFor(() => connectRes1 != null);
    expect(connectRes1.connectionId).toBe(connectionId);
    expect(connectRes1.polite).toBe(false);

    await signaling2.createConnection(connectionId);
    await waitFor(() => connectRes2 != null);
    expect(connectRes2.connectionId).toBe(connectionId);
    expect(connectRes2.polite).toBe(true);

    await sleep(signaling1.interval * 2);

    await signaling1.deleteConnection(connectionId);
    await waitFor(() => disconnectRes1 != null && disconnectRes2 != null);
    expect(disconnectRes1.connectionId).toBe(connectionId);
    expect(disconnectRes2.connectionId).toBe(connectionId);

    disconnectRes2 = null;
    await signaling2.deleteConnection(connectionId);
    await waitFor(() => disconnectRes2 != null);
  });

  test(`onOffer using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);

    await signaling1.createConnection(connectionId);
    await waitFor(() => connectRes1 != null);
    expect(connectRes1.connectionId).toBe(connectionId);

    signaling1.sendOffer(connectionId, testsdp);
    await sleep(signaling1.interval * 2);
    // Do not receive offer other signaling if not connected same sendoffer connectionId in private mode
    expect(offerRes2).toBeUndefined();

    await signaling2.createConnection(connectionId);
    await waitFor(() => connectRes2 != null);
    expect(connectRes2.connectionId).toBe(connectionId);

    await signaling1.sendOffer(connectionId, testsdp);
    await waitFor(() => offerRes2 != null);
    expect(offerRes2.connectionId).toBe(connectionId);
    expect(offerRes2.polite).toBe(true);

    await signaling1.deleteConnection(connectionId);
    await waitFor(() => disconnectRes1 != null && disconnectRes2 != null);
    expect(disconnectRes1.connectionId).toBe(connectionId);
    expect(disconnectRes2.connectionId).toBe(connectionId);

    disconnectRes2 = null;
    await signaling2.deleteConnection(connectionId);
    await waitFor(() => disconnectRes2 != null);
  });

  test(`onAnswer using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    let answerRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);
    signaling1.addEventListener('answer', (e) => answerRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);

    await signaling1.createConnection(connectionId);
    await signaling2.createConnection(connectionId);
    await waitFor(() => connectRes1 != null && connectRes2 != null);

    await signaling1.sendOffer(connectionId, testsdp);
    await waitFor(() => offerRes2 != null);
    expect(offerRes2.connectionId).toBe(connectionId);
    expect(offerRes2.sdp).toBe(testsdp);

    await signaling2.sendAnswer(connectionId, testsdp);
    await waitFor(() => answerRes1 != null);
    expect(answerRes1.connectionId).toBe(connectionId);
    expect(answerRes1.sdp).toBe(testsdp);

    await signaling1.deleteConnection(connectionId);
    await waitFor(() => disconnectRes1 != null && disconnectRes2 != null);
    expect(disconnectRes1.connectionId).toBe(connectionId);
    expect(disconnectRes2.connectionId).toBe(connectionId);

    disconnectRes2 = null;
    await signaling2.deleteConnection(connectionId);
    await waitFor(() => disconnectRes2 != null);
  });

  test(`onCandidate using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    let answerRes1;
    let candidateRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);
    signaling1.addEventListener('answer', (e) => answerRes1 = e.detail);
    signaling1.addEventListener('candidate', (e) => candidateRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    let candidateRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);
    signaling2.addEventListener('candidate', (e) => candidateRes2 = e.detail);

    await signaling1.createConnection(connectionId);
    await signaling2.createConnection(connectionId);
    await waitFor(() => connectRes1 != null && connectRes2 != null);

    await signaling1.sendOffer(connectionId, testsdp);
    await waitFor(() => offerRes2 != null);
    expect(offerRes2.connectionId).toBe(connectionId);
    expect(offerRes2.sdp).toBe(testsdp);

    await signaling2.sendAnswer(connectionId, testsdp);
    await waitFor(() => answerRes1 != null);
    expect(answerRes1.connectionId).toBe(connectionId);
    expect(answerRes1.sdp).toBe(testsdp);

    await signaling2.sendCandidate(connectionId, testcandidate, 1, 1);
    await waitFor(() => candidateRes1 != null);
    expect(candidateRes1.connectionId).toBe(connectionId);
    expect(candidateRes1.candidate).toBe(testcandidate);
    expect(candidateRes1.sdpMLineIndex).toBe(1);
    expect(candidateRes1.sdpMid).toBe(1);

    await signaling1.sendCandidate(connectionId, testcandidate, 1, 1);
    await waitFor(() => candidateRes2 != null);
    expect(candidateRes2.connectionId).toBe(connectionId);
    expect(candidateRes2.candidate).toBe(testcandidate);
    expect(candidateRes2.sdpMLineIndex).toBe(1);
    expect(candidateRes2.sdpMid).toBe(1);

    await signaling1.deleteConnection(connectionId);
    await waitFor(() => disconnectRes1 != null && disconnectRes2 != null);
    expect(disconnectRes1.connectionId).toBe(connectionId);
    expect(disconnectRes2.connectionId).toBe(connectionId);

    disconnectRes2 = null;
    await signaling2.deleteConnection(connectionId);
    await waitFor(() => disconnectRes2 != null);
  });

  test(`notReceiveOwnOfferAnswer using ${mode}`, async () => {
    let connectRes1;
    let disconnectRes1;
    let offerRes1;
    let answerRes1;
    signaling1.addEventListener('connect', (e) => connectRes1 = e.detail);
    signaling1.addEventListener('disconnect', (e) => disconnectRes1 = e.detail);

    let connectRes2;
    let disconnectRes2;
    let offerRes2;
    let answerRes2;
    signaling2.addEventListener('connect', (e) => connectRes2 = e.detail);
    signaling2.addEventListener('disconnect', (e) => disconnectRes2 = e.detail);

    await signaling1.createConnection(connectionId);
    await signaling2.createConnection(connectionId);
    await waitFor(() => connectRes1 != null && connectRes2 != null);

    signaling1.addEventListener('offer', (e) => offerRes1 = e.detail);
    signaling2.addEventListener('offer', (e) => offerRes2 = e.detail);
    await signaling1.sendOffer(connectionId, testsdp);
    await waitFor(() => offerRes2 != null);
    await sleep(signaling1.interval * 2);
    expect(offerRes1).toBeUndefined();
    expect(offerRes2).not.toBeUndefined();
    expect(offerRes2.connectionId).toBe(connectionId);
    expect(offerRes2.sdp).toBe(testsdp);

    signaling1.addEventListener('answer', (e) => answerRes1 = e.detail);
    signaling2.addEventListener('answer', (e) => answerRes2 = e.detail);
    await signaling2.sendAnswer(connectionId, testsdp);
    await waitFor(() => answerRes1 != null);
    await sleep(signaling2.interval * 2);
    expect(answerRes1).not.toBeUndefined();
    expect(answerRes1.connectionId).toBe(connectionId);
    expect(answerRes1.sdp).toBe(testsdp);
    expect(answerRes2).toBeUndefined();

    await signaling1.deleteConnection(connectionId);
    await waitFor(() => disconnectRes1 != null && disconnectRes2 != null);
    expect(disconnectRes1.connectionId).toBe(connectionId);
    expect(disconnectRes2.connectionId).toBe(connectionId);

    disconnectRes2 = null;
    await signaling2.deleteConnection(connectionId);
    await waitFor(() => disconnectRes2 != null);
  });
});

// A signaling peer can't be reliably split into "listener" vs "streamer" by message type -
// renegotiation means either side can end up offering or answering depending on who triggers it
// (see websocket.ts/httphandler.ts for the full reasoning). What's actually gated is whether a
// given offer/answer's SDP *declares its sender a media source* (sdpDeclaresSend: any audio/video
// m-line that isn't recvonly/inactive) - true regardless of message type, false for e.g. a
// listener's recvonly answer or its initial audio-less offer. A wrong token still gets the whole
// connection rejected; a missing token is always allowed to connect and exchange recvonly
// SDP, but rejected specifically on any SDP that would make it a sender.
describe.each([
  { mode: "http" },
  { mode: "websocket" },
])('signaling test with an auth token required', ({ mode }) => {
  const authToken = "testsecret";
  const connectionId1 = "auth-test-connection-1";

  const sdpWithAudio = (direction) =>
    'v=0\r\n' +
    'o=- 1 1 IN IP4 127.0.0.1\r\n' +
    's=-\r\n' +
    't=0 0\r\n' +
    'm=audio 9 UDP/TLS/RTP/SAVPF 96\r\n' +
    'c=IN IP4 0.0.0.0\r\n' +
    `a=${direction}\r\n` +
    'a=rtpmap:96 opus/48000/2\r\n';

  beforeAll(async () => {
    const path = Path.resolve(`../bin~/${serverExeName()}`);
    let cmd = `${path} -p ${portNumber} -a ${authToken}`;
    if (mode == "http") {
      cmd += " -t http";
    }
    await setup({ command: cmd, port: portNumber, usedPortAction: 'error' });
  });

  afterAll(async () => {
    await teardown();
    // work around for linux, waitng kill server process
    await sleep(1000);
  });

  if (mode == "http") {
    test('rejects a wrong token at the connection level', async () => {
      const res = await fetch(`http://127.0.0.1:${portNumber}/signaling`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wrong' },
      });
      expect(res.status).toBe(401);
    });

    test('a recvonly (listening) offer never needs a token, but a sendonly one does', async () => {
      const createRes = await fetch(`http://127.0.0.1:${portNumber}/signaling`, { method: 'PUT', headers: { 'Content-Type': 'application/json' } });
      const { sessionId } = await createRes.json();
      const post = (sdp, headers = {}) => fetch(`http://127.0.0.1:${portNumber}/signaling/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Session-Id': sessionId, ...headers },
        body: JSON.stringify({ sdp, connectionId: connectionId1 }),
      });

      expect((await post(sdpWithAudio('recvonly'))).status).toBe(200);
      expect((await post(sdpWithAudio('sendonly'))).status).toBe(401);
      expect((await post(sdpWithAudio('sendonly'), { Authorization: `Bearer ${authToken}` })).status).toBe(200);

      await fetch(`http://127.0.0.1:${portNumber}/signaling`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Session-Id': sessionId } });
    });
  }

  if (mode == "websocket") {
    test('rejects a wrong token at the connection level (websocket)', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${portNumber}/?token=wrong`);
      let opened = false;
      let rejectedStatus;
      ws.onopen = () => { opened = true; };
      ws.onclose = (event) => { rejectedStatus = event.code; };
      await waitFor(() => opened || rejectedStatus != null);
      expect(opened).toBe(false);
    });

    test('a peer with no token can send recvonly SDP but not sendonly', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${portNumber}`);
      let lastError;
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'error') {
          lastError = msg;
        }
      };
      await waitFor(() => ws.readyState === WebSocket.OPEN);

      ws.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('sendonly'), connectionId: connectionId1 } }));
      await waitFor(() => lastError != null);
      expect(lastError.message).toMatch(/token/);

      lastError = null;
      ws.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('recvonly'), connectionId: connectionId1 } }));
      await sleep(200);
      expect(lastError).toBeNull();

      ws.close();
    });

    // This is the actual bug this whole redesign fixes: AudioStreamSender rebinding makes Unity
    // renegotiate - Unity (authenticated) sends the offer, and the listener (no token) must be
    // able to answer it. Gating by message type broke exactly this.
    test("Unity's authenticated sendonly offer gets a valid answer from an unauthenticated listener", async () => {
      const unity = new WebSocket(`ws://127.0.0.1:${portNumber}/?token=${authToken}`);
      let unityGotAnswer;
      unity.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'answer') {
          unityGotAnswer = msg;
        }
      };
      await waitFor(() => unity.readyState === WebSocket.OPEN);

      const listener = new WebSocket(`ws://127.0.0.1:${portNumber}`);
      let listenerGotOffer;
      listener.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'offer') {
          listenerGotOffer = msg;
        }
      };
      await waitFor(() => listener.readyState === WebSocket.OPEN);

      unity.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('sendonly'), connectionId: connectionId1 } }));
      await waitFor(() => listenerGotOffer != null);

      listener.send(JSON.stringify({ type: 'answer', from: connectionId1, data: { sdp: sdpWithAudio('recvonly'), connectionId: connectionId1 } }));
      await waitFor(() => unityGotAnswer != null);
      expect(unityGotAnswer.data.sdp).toBe(sdpWithAudio('recvonly'));

      unity.close();
      listener.close();
    });
  }
});
