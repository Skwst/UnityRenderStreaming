import { sdpDeclaresSend } from '../src/class/sdp';

// Minimal but structurally realistic SDP fragments - only the bits sdpDeclaresSend actually
// looks at (m= lines and a=<direction> lines) need to be accurate.
const sdpWithAudioDirection = (direction: string | null): string => {
  const directionLine = direction ? `a=${direction}\r\n` : '';
  return (
    'v=0\r\n' +
    'o=- 1 1 IN IP4 127.0.0.1\r\n' +
    's=-\r\n' +
    't=0 0\r\n' +
    'm=audio 9 UDP/TLS/RTP/SAVPF 96\r\n' +
    'c=IN IP4 0.0.0.0\r\n' +
    directionLine +
    'a=rtpmap:96 opus/48000/2\r\n'
  );
};

describe('sdpDeclaresSend', () => {
  test('sendonly audio declares send', () => {
    expect(sdpDeclaresSend(sdpWithAudioDirection('sendonly'))).toBe(true);
  });

  test('sendrecv audio declares send', () => {
    expect(sdpDeclaresSend(sdpWithAudioDirection('sendrecv'))).toBe(true);
  });

  test('recvonly audio does not declare send', () => {
    expect(sdpDeclaresSend(sdpWithAudioDirection('recvonly'))).toBe(false);
  });

  test('inactive audio does not declare send', () => {
    expect(sdpDeclaresSend(sdpWithAudioDirection('inactive'))).toBe(false);
  });

  test('audio m-line with no explicit direction defaults to sendrecv (declares send)', () => {
    expect(sdpDeclaresSend(sdpWithAudioDirection(null))).toBe(true);
  });

  test('a data-channel-only SDP (no audio/video m-line) never declares send', () => {
    const sdp =
      'v=0\r\n' +
      'o=- 1 1 IN IP4 127.0.0.1\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=sctp-port:5000\r\n';
    expect(sdpDeclaresSend(sdp)).toBe(false);
  });

  test('video m-line is checked the same way as audio', () => {
    const sdp =
      'v=0\r\n' +
      'o=- 1 1 IN IP4 127.0.0.1\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'm=video 9 UDP/TLS/RTP/SAVPF 100\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=sendonly\r\n' +
      'a=rtpmap:100 VP8/90000\r\n';
    expect(sdpDeclaresSend(sdp)).toBe(true);
  });

  test('recvonly audio alongside a data channel still does not declare send', () => {
    const sdp =
      'v=0\r\n' +
      'o=- 1 1 IN IP4 127.0.0.1\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=sctp-port:5000\r\n' +
      'm=audio 9 UDP/TLS/RTP/SAVPF 96\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=recvonly\r\n' +
      'a=rtpmap:96 opus/48000/2\r\n';
    expect(sdpDeclaresSend(sdp)).toBe(false);
  });

  test('a later sendonly video m-line is found even if an earlier m-line is recvonly', () => {
    const sdp =
      'v=0\r\n' +
      'o=- 1 1 IN IP4 127.0.0.1\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'm=audio 9 UDP/TLS/RTP/SAVPF 96\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=recvonly\r\n' +
      'a=rtpmap:96 opus/48000/2\r\n' +
      'm=video 9 UDP/TLS/RTP/SAVPF 100\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=sendonly\r\n' +
      'a=rtpmap:100 VP8/90000\r\n';
    expect(sdpDeclaresSend(sdp)).toBe(true);
  });

  test('handles \\n-only line endings, not just \\r\\n', () => {
    const sdp = sdpWithAudioDirection('sendonly').replace(/\r\n/g, '\n');
    expect(sdpDeclaresSend(sdp)).toBe(true);
  });

  test('empty SDP does not declare send', () => {
    expect(sdpDeclaresSend('')).toBe(false);
  });
});
