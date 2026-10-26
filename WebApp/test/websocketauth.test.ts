import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket = require('ws');
import WSSignaling from '../src/websocket';

// The websocket half of client/test/signaling.test.js's "auth token required" suite. It lives
// here because the token travels in the handshake's Authorization header, which only a Node
// client (ws) can send - the client tests run under jsdom.
describe('websocket signaling with an auth token required', () => {
  const authToken = 'testsecret';
  const connectionId1 = 'auth-test-connection-1';
  let server: Server;
  let url: string;

  const sdpWithAudio = (direction: string): string =>
    'v=0\r\n' +
    'o=- 1 1 IN IP4 127.0.0.1\r\n' +
    's=-\r\n' +
    't=0 0\r\n' +
    'm=audio 9 UDP/TLS/RTP/SAVPF 96\r\n' +
    'c=IN IP4 0.0.0.0\r\n' +
    `a=${direction}\r\n` +
    'a=rtpmap:96 opus/48000/2\r\n';

  // What websocket-sharp's SetCredentials(user, token, preAuth: true) sends from Unity.
  const basic = (user: string, password: string): string =>
    'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');

  const connect = (authorization?: string): WebSocket =>
    new WebSocket(url, authorization ? { headers: { Authorization: authorization } } : {});

  const opened = (ws: WebSocket): Promise<boolean> =>
    new Promise(resolve => {
      ws.once('open', () => resolve(true));
      ws.once('error', () => resolve(false));
    });

  const nextMessage = (ws: WebSocket, type: string, timeout = 500): Promise<any> =>
    new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), timeout);
      ws.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    server = createServer();
    new WSSignaling(server, 'public', authToken);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    jest.restoreAllMocks();
  });

  test.each([
    ['a wrong Bearer token', 'Bearer wrong'],
    ['a wrong Basic password', basic('unity', 'wrong')],
  ])('rejects %s at the handshake', async (_, authorization) => {
    expect(await opened(connect(authorization))).toBe(false);
  });

  test('ignores a token in the url', async () => {
    const ws = new WebSocket(`${url}/?token=${authToken}`);
    expect(await opened(ws)).toBe(true);

    const error = nextMessage(ws, 'error');
    ws.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('sendonly'), connectionId: connectionId1 } }));
    expect((await error)?.message).toMatch(/token/);
    ws.close();
  });

  test('a peer with no token can send recvonly SDP but not sendonly', async () => {
    const ws = connect();
    expect(await opened(ws)).toBe(true);

    const error = nextMessage(ws, 'error');
    ws.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('sendonly'), connectionId: connectionId1 } }));
    expect((await error)?.message).toMatch(/token/);

    const noError = nextMessage(ws, 'error', 200);
    ws.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('recvonly'), connectionId: connectionId1 } }));
    expect(await noError).toBeNull();

    ws.close();
  });

  // AudioStreamSender rebinding makes Unity renegotiate - Unity (authenticated) sends the offer,
  // and the listener (no token) must be able to answer it.
  test.each([
    ['Bearer', `Bearer ${authToken}`],
    ['Basic', basic('unity', authToken)],
  ])("Unity's %s-authenticated sendonly offer gets a valid answer from an unauthenticated listener", async (_, authorization) => {
    const unity = connect(authorization);
    expect(await opened(unity)).toBe(true);
    const listener = connect();
    expect(await opened(listener)).toBe(true);

    const listenerGotOffer = nextMessage(listener, 'offer');
    unity.send(JSON.stringify({ type: 'offer', connectionId: connectionId1, data: { sdp: sdpWithAudio('sendonly'), connectionId: connectionId1 } }));
    expect(await listenerGotOffer).not.toBeNull();

    const unityGotAnswer = nextMessage(unity, 'answer');
    listener.send(JSON.stringify({ type: 'answer', from: connectionId1, data: { sdp: sdpWithAudio('recvonly'), connectionId: connectionId1 } }));
    expect((await unityGotAnswer)?.data.sdp).toBe(sdpWithAudio('recvonly'));

    unity.close();
    listener.close();
  });
});
