import * as websocket from "ws";
import { Server, IncomingMessage } from 'http';
import * as handler from "./class/websockethandler";

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

export default class WSSignaling {
  server: Server;
  wss: websocket.Server;

  constructor(server: Server, mode: string) {
    this.server = server;
    this.wss = new websocket.Server({ server });
    handler.reset(mode);

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {

      const roomName = getRoomName(request);
      if (roomName === null) {
        console.log(`rejected connection, invalid room name in ${request.url}`);
        ws.close(1008, 'room name must match [A-Za-z0-9_-]{1,64}');
        return;
      }

      console.log(`connected to room "${roomName}"`);
      handler.add(ws, roomName);

      ws.onclose = (): void => {
        handler.remove(ws);
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
            handler.onOffer(ws, msg.data);
            break;
          case "answer":
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
