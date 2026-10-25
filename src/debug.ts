export type DebugRegion = 'tidepool' | 'ember' | 'hollow';
export type DebugEvent = 'comet' | 'binary' | 'pulsar';
export type DebugPlanet = 'rocky' | 'ocean' | 'gas' | 'ice' | 'ember';

export type ReviewSettings = {
  region?: DebugRegion;
  event?: DebugEvent;
  planet?: DebugPlanet;
  ring?: boolean;
  hideNebula?: boolean;
  hideSky?: boolean;
};

export function reviewSettings(search: string, hostname: string): ReviewSettings {
  const params = new URLSearchParams(search);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname) || params.get('debug') !== '1') return {};
  const region = params.get('debugRegion'), event = params.get('debugEvent'), planet = params.get('debugPlanet');
  return { region: region !== null && (['tidepool', 'ember', 'hollow'] as const).includes(region as DebugRegion) ? region as DebugRegion : undefined,
    event: event !== null && (['comet', 'binary', 'pulsar'] as const).includes(event as DebugEvent) ? event as DebugEvent : undefined,
    planet: planet !== null && (['rocky', 'ocean', 'gas', 'ice', 'ember'] as const).includes(planet as DebugPlanet) ? planet as DebugPlanet : undefined,
    ring: params.get('debugRing') === '1',
    hideNebula: params.get('debugHide') === 'nebula', hideSky: params.get('debugHide') === 'sky' };
}
