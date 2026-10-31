/** Travel speed choices: a factor on the whale's cruising speed. */
export const PACES = { slow: 0.6, normal: 1, fast: 1.5 } as const;
export type Pace = keyof typeof PACES;

export const isPace = (value: unknown): value is Pace =>
  typeof value === 'string' && Object.hasOwn(PACES, value);
