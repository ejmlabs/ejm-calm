/** Deletes the oldest entries (first inserted) of a Map or Set until at most `cap` remain: every cache's bound. */
export function trimOldest<K>(entries: Map<K, unknown> | Set<K>, cap: number): void {
  for (const key of entries.keys()) {
    if (entries.size <= cap) return;
    entries.delete(key);
  }
}
