export function reviewSettings(search, hostname) {
  const params = new URLSearchParams(search);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname) || params.get('debug') !== '1') return {};
  const region = params.get('debugRegion'), event = params.get('debugEvent'), planet = params.get('debugPlanet');
  return { region: ['tidepool', 'ember', 'hollow'].includes(region) ? region : undefined,
    event: ['comet', 'binary', 'pulsar'].includes(event) ? event : undefined,
    planet: ['rocky', 'ocean', 'gas', 'ice', 'ember'].includes(planet) ? planet : undefined,
    ring: params.get('debugRing') === '1',
    hideNebula: params.get('debugHide') === 'nebula', hideSky: params.get('debugHide') === 'sky' };
}
