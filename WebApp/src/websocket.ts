import * as websocket from "ws";
import { Server, IncomingMessage } from 'http';
import * as handler from "./class/websockethandler";
import { sdpDeclaresSend } from "./class/sdp";

// Reads the room this client wants to join from the handshake url, e.g. ws://host/?room=antigone.
// Returns null when the requested name is not usable, so the caller can reject the socket
// instead of silently dropping the client into the default room.
function getRoomName(request: IncomingMessage): string | null {
  const room = new URL(request.url ?? '/', 'http://localhost').searchParams.get('room');
  if (!room) {
    return handler.defaultRoomName;
  }
  return handler.isValidRoomName(room) ? room : null;
}

// A signaling peer can't be split into "listener" vs "streamer" by message type: renegotiation
// (e.g. Unity swapping its audio source) makes either side send offers or answers depending on
// who happens to trigger that round. What actually matters is whether a given offer/answer
// *declares its author a media sender* (sdpDeclaresSend, checked per-message below) - that's
// true regardless of message type or who sent it, and false for e.g. a listener's recvonly
// answer or its initial, audio-less offer. A wrong token still gets the whole handshake rejected
// (guessing/forging is blocked); a missing token is allowed to connect and act as a listener, but
// any message from that connection that would grant it "sender" status is rejected instead.
//
// Browsers can't set custom headers on a WebSocket handshake, so the token travels in the query
// string here (unlike the HTTP polling routes, which use an Authorization header); this is safe
// under wss:// (TLS encrypts the whole request line) and the server never logs the WS upgrade
// URL (it's handled on the raw http.Server, bypassing Express/morgan entirely).
function getToken(request: IncomingMessage): string | null {
  return new URL(request.url ?? '/', 'http://localhost').searchParams.get('token');
}

export default class WSSignaling {
  server: Server;
  wss: websocket.Server;

  constructor(server: Server, mode: string, authtoken?: string) {
    this.server = server;
    this.wss = new websocket.Server({
      server,
      verifyClient: (info, callback) => {
        if (!authtoken) {
          callback(true);
          return;
        }
        const token = getToken(info.req);
        if (token !== null && token !== authtoken) {
          callback(false, 401, 'Unauthorized');
          return;
        }
        callback(true);
      },
    });
    handler.reset(mode);

    // Per-connection: did this socket present the correct token at handshake time? A WS
    // connection has no per-message headers (unlike HTTP), so this is captured once here and
    // consulted whenever that socket sends an offer/answer that would make it a media sender.
    const authenticated = new WeakMap<WebSocket, boolean>();

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {

      const roomName = getRoomName(request);
      if (roomName === null) {
        console.log(`rejected connection, invalid room name in ${request.url}`);
        ws.close(1008, 'room name must match [A-Za-z0-9_-]{1,64}');
        return;
      }

      authenticated.set(ws, !!authtoken && getToken(request) === authtoken);

      console.log(`connected to room "${roomName}"`);
      handler.add(ws, roomName);

      ws.onclose = (): void => {
        handler.remove(ws);
        authenticated.delete(ws);
      };

      ws.onmessage = (event: MessageEvent): void => {

        // type: connect, disconnect JSON Schema
        // connectionId: connect or disconnect connectionId

        // type: offer, answer, candidate JSON Schema
        // from: from connection id
        // to: to connection id
        // data: any message data structure

        const msg = JSON.parse(event.data);
        if (!msg || !this) {
          return;
        }

        console.log(msg);

        switch (msg.type) {
          case "connect":
            handler.onConnect(ws, msg.connectionId);
            break;
          case "disconnect":
            handler.onDisconnect(ws, msg.connectionId);
            break;
          case "offer":
            if (authtoken && sdpDeclaresSend(msg.data.sdp) && !authenticated.get(ws)) {
              ws.send(JSON.stringify({ type: "error", message: "a valid token is required to send media" }));
              break;
            }
            handler.onOffer(ws, msg.data);
            break;
          case "answer":
            if (authtoken && sdpDeclaresSend(msg.data.sdp) && !authenticated.get(ws)) {
              ws.send(JSON.stringify({ type: "error", message: "a valid token is required to send media" }));
              break;
            }
            handler.onAnswer(ws, msg.data);
            break;
          case "candidate":
            handler.onCandidate(ws, msg.data);
            break;
          default:
            break;
        }
      };
    });
  }
}
