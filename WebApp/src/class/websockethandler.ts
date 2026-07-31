import Offer from './offer';
import Answer from './answer';
import Candidate from './candidate';

let isPrivate: boolean;

// Clients that connect without a "room" query parameter land here.
const defaultRoomName = "default";

const roomNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

// A room is an isolated signaling space: public mode fans messages out to the
// other clients of the same room only, so several Unity apps can share one server.
class Room {
  // [{sessonId:[connectionId,...]}]
  readonly clients: Map<WebSocket, Set<string>> = new Map<WebSocket, Set<string>>();

  // [{connectionId:[sessionId1, sessionId2]}]
  readonly connectionPair: Map<string, [WebSocket, WebSocket]> = new Map<string, [WebSocket, WebSocket]>();

  constructor(public readonly name: string) { }
}

// [{roomName:Room}]
const rooms: Map<string, Room> = new Map<string, Room>();

// Signaling messages only carry the socket, so keep a reverse lookup to its room.
const roomOfClient: Map<WebSocket, Room> = new Map<WebSocket, Room>();

function isValidRoomName(name: string): boolean {
  return roomNamePattern.test(name);
}

function getOrCreateRoom(name: string): Room {
  let room = rooms.get(name);
  if (!room) {
    room = new Room(name);
    rooms.set(name, room);
  }
  return room;
}

function getOrCreateConnectionIds(room: Room, session: WebSocket): Set<string> {
  let connectionIds = room.clients.get(session);
  if (!connectionIds) {
    connectionIds = new Set<string>();
    room.clients.set(session, connectionIds);
  }
  return connectionIds;
}

function reset(mode: string): void {
  isPrivate = mode == "private";
  rooms.clear();
  roomOfClient.clear();
}

function add(ws: WebSocket, roomName: string = defaultRoomName): void {
  const room = getOrCreateRoom(roomName);
  room.clients.set(ws, new Set<string>());
  roomOfClient.set(ws, room);
}

function remove(ws: WebSocket): void {
  const room = roomOfClient.get(ws);
  if (!room) {
    return;
  }

  const connectionIds = room.clients.get(ws);
  if (connectionIds) {
    connectionIds.forEach(connectionId => {
      const pair = room.connectionPair.get(connectionId);
      if (pair) {
        const otherSessionWs = pair[0] == ws ? pair[1] : pair[0];
        if (otherSessionWs) {
          otherSessionWs.send(JSON.stringify({ type: "disconnect", connectionId: connectionId }));
        }
      }
      room.connectionPair.delete(connectionId);
    });
  }

  room.clients.delete(ws);
  roomOfClient.delete(ws);

  if (room.clients.size == 0) {
    rooms.delete(room.name);
  }
}

function onConnect(ws: WebSocket, connectionId: string): void {
  const room = roomOfClient.get(ws);
  if (!room) {
    return;
  }

  let polite = true;
  if (isPrivate) {
    if (room.connectionPair.has(connectionId)) {
      const pair = room.connectionPair.get(connectionId);

      if (pair[0] != null && pair[1] != null) {
        ws.send(JSON.stringify({ type: "error", message: `${connectionId}: This connection id is already used.` }));
        return;
      } else if (pair[0] != null) {
        room.connectionPair.set(connectionId, [pair[0], ws]);
      }
    } else {
      room.connectionPair.set(connectionId, [ws, null]);
      polite = false;
    }
  }

  const connectionIds = getOrCreateConnectionIds(room, ws);
  connectionIds.add(connectionId);
  ws.send(JSON.stringify({ type: "connect", connectionId: connectionId, polite: polite }));
}

function onDisconnect(ws: WebSocket, connectionId: string): void {
  const room = roomOfClient.get(ws);
  if (!room) {
    return;
  }

  const connectionIds = room.clients.get(ws);
  connectionIds.delete(connectionId);

  if (room.connectionPair.has(connectionId)) {
    const pair = room.connectionPair.get(connectionId);
    const otherSessionWs = pair[0] == ws ? pair[1] : pair[0];
    if (otherSessionWs) {
      otherSessionWs.send(JSON.stringify({ type: "disconnect", connectionId: connectionId }));
    }
  }
  room.connectionPair.delete(connectionId);
  ws.send(JSON.stringify({ type: "disconnect", connectionId: connectionId }));
}

function onOffer(ws: WebSocket, message: any): void {
  const room = roomOfClient.get(ws);
  if (!room) {
    return;
  }

  const connectionId = message.connectionId as string;
  const newOffer = new Offer(message.sdp, Date.now(), false);

  if (isPrivate) {
    if (room.connectionPair.has(connectionId)) {
      const pair = room.connectionPair.get(connectionId);
      const otherSessionWs = pair[0] == ws ? pair[1] : pair[0];
      if (otherSessionWs) {
        newOffer.polite = true;
        otherSessionWs.send(JSON.stringify({ from: connectionId, to: "", type: "offer", data: newOffer }));
      }
    }
    return;
  }

  room.connectionPair.set(connectionId, [ws, null]);
  room.clients.forEach((_v, k) => {
    if (k == ws) {
      return;
    }
    k.send(JSON.stringify({ from: connectionId, to: "", type: "offer", data: newOffer }));
  });
}

function onAnswer(ws: WebSocket, message: any): void {
  const room = roomOfClient.get(ws);
  if (!room) {
    return;
  }

  const connectionId = message.connectionId as string;
  const connectionIds = getOrCreateConnectionIds(room, ws);
  connectionIds.add(connectionId);
  const newAnswer = new Answer(message.sdp, Date.now());

  if (!room.connectionPair.has(connectionId)) {
    return;
  }

  const pair = room.connectionPair.get(connectionId);
  const otherSessionWs = pair[0] == ws ? pair[1] : pair[0];

  if (!isPrivate) {
    room.connectionPair.set(connectionId, [otherSessionWs, ws]);
  }

  otherSessionWs.send(JSON.stringify({ from: connectionId, to: "", type: "answer", data: newAnswer }));
}

function onCandidate(ws: WebSocket, message: any): void {
  const room = roomOfClient.get(ws);
  if (!room) {
    return;
  }

  const connectionId = message.connectionId;
  const candidate = new Candidate(message.candidate, message.sdpMLineIndex, message.sdpMid, Date.now());

  if (isPrivate) {
    if (room.connectionPair.has(connectionId)) {
      const pair = room.connectionPair.get(connectionId);
      const otherSessionWs = pair[0] == ws ? pair[1] : pair[0];
      if (otherSessionWs) {
        otherSessionWs.send(JSON.stringify({ from: connectionId, to: "", type: "candidate", data: candidate }));
      }
    }
    return;
  }

  room.clients.forEach((_v, k) => {
    if (k === ws) {
      return;
    }
    k.send(JSON.stringify({ from: connectionId, to: "", type: "candidate", data: candidate }));
  });
}

export { defaultRoomName, isValidRoomName, reset, add, remove, onConnect, onDisconnect, onOffer, onAnswer, onCandidate };
