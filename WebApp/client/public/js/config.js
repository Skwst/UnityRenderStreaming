const allServersKey = 'servers';
const defaultServers = [{ urls: ['stun:stun.l.google.com:19302'] }];

export async function getServerConfig() {
  const protocolEndPoint = location.origin + '/config';
  const createResponse = await fetch(protocolEndPoint);
  return await createResponse.json();
}

/**
 * ICE servers come from localStorage under the "servers" key so a deployment can point at its
 * own STUN/TURN without rebuilding, and fall back to a public STUN server otherwise.
 */
function getServers() {
  const storedServers = window.localStorage.getItem(allServersKey);

  if (storedServers === null || storedServers === '') {
    return defaultServers;
  }
  return JSON.parse(storedServers);
}

export function getRTCConfiguration() {
  let config = {};
  config.sdpSemantics = 'unified-plan';
  config.iceServers = getServers();
  return config;
}
