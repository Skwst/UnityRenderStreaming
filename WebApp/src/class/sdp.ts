// A signaling relay can't tell "listener" from "streamer" by whether a message is an offer or
// an answer: renegotiation (e.g. a track being rebuilt) makes either peer send either message
// type, depending only on who happened to trigger that round. The thing that actually matters -
// whether this specific SDP grants its author the right to *send* audio/video - is declared in
// each m=audio/m=video section's direction attribute, independent of offer/answer or who sent
// it. sdpDeclaresSend reads exactly that, so callers can gate "may this peer become a media
// source" without caring about message type at all.

const SEND_DIRECTIONS = new Set(['sendrecv', 'sendonly']);
const KNOWN_DIRECTIONS = new Set(['sendrecv', 'sendonly', 'recvonly', 'inactive']);

/**
 * True if the given SDP declares (on any audio or video m-line) that its author will send
 * media - i.e. the m-line's direction is "sendrecv" or "sendonly", including the RFC 8866
 * default of "sendrecv" when no direction attribute is present at all. Data channel
 * (m=application) sections have no direction attribute and are ignored.
 */
export function sdpDeclaresSend(sdp: string): boolean {
  let mediaType: string | null = null;
  let direction: string | null = null;

  const sectionDeclaresSend = (): boolean =>
    (mediaType === 'audio' || mediaType === 'video') &&
    (direction === null || SEND_DIRECTIONS.has(direction));

  for (const rawLine of sdp.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();

    if (line.startsWith('m=')) {
      if (sectionDeclaresSend()) {
        return true;
      }
      // "m=<type> <port> <proto> <fmt> ..." - only the type is needed here.
      mediaType = line.slice(2).split(' ')[0] || null;
      direction = null;
      continue;
    }

    if (mediaType === null) {
      continue; // Session-level line before the first m= section; not a media direction.
    }

    if (line.startsWith('a=')) {
      const attribute = line.slice(2);
      if (KNOWN_DIRECTIONS.has(attribute)) {
        direction = attribute;
      }
    }
  }

  return sectionDeclaresSend();
}
