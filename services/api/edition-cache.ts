// Process-local LRU. No authentication, mutable pointers or saves belong here.
// Copies isolate callers; only complete, validated editions are inserted.
export class EditionCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(
    private capacity = 32,
    private ttl = 60_000,
    private now = Date.now,
  ) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    if (entry.expires <= this.now()) return;
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, {
      value: structuredClone(value),
      expires: this.now() + this.ttl,
    });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
