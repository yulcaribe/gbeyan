// Disposable mail snapshots. Folder defaults are supplied by environment variables.
export class MailStore {
  snapshot = null;
  settings = null;
  pendingRefresh = null;
  parsedGendec = new Map();
  gendecParsing = {
    active: false,
    fileName: '',
    flightNumber: '',
    startedAt: null,
    completedAt: null,
    error: null
  };

  async getMailSnapshot() { return this.snapshot; }
  async saveMailSnapshot(snapshot) {
    this.snapshot = snapshot;
    return { cachedAt: snapshot?.cachedAt || null };
  }
  async clearMailSnapshot() { this.snapshot = null; }
  async getMailSettings() { return this.settings; }
  async saveMailSettings(settings) { this.settings = { ...settings }; return this.settings; }

  async getParsedGendec(key) { return this.parsedGendec.get(key) || null; }
  async saveParsedGendec(key, value) {
    if (this.parsedGendec.size >= 250 && !this.parsedGendec.has(key)) {
      this.parsedGendec.delete(this.parsedGendec.keys().next().value);
    }
    this.parsedGendec.set(key, value);
    return value;
  }
  async getParsedGendecEntries() {
    return [...this.parsedGendec.entries()].map(([key, value]) => ({ key, ...value }));
  }
  async pruneParsedGendec(validKeys = []) {
    const valid = new Set(validKeys);
    for (const key of this.parsedGendec.keys()) {
      if (!valid.has(key)) this.parsedGendec.delete(key);
    }
  }
  async getLatestGendecByFlight(flightNumber) {
    const wanted = String(flightNumber || '').trim().toUpperCase();
    const records = [...this.parsedGendec.values()]
      .filter(item => String(item?.flightNumber || '').toUpperCase() === wanted)
      .sort((left, right) =>
        String(right?.receivedAt || '').localeCompare(String(left?.receivedAt || ''))
        || String(right?.parsedAt || '').localeCompare(String(left?.parsedAt || ''))
      );
    return records[0] || null;
  }

  async setGendecParsingStatus(status = {}) {
    this.gendecParsing = {
      ...this.gendecParsing,
      ...status
    };
    return this.gendecParsing;
  }
  async getGendecParsingStatus() {
    return { ...this.gendecParsing };
  }

  async runRefresh(load) {
    if (!this.pendingRefresh) {
      this.pendingRefresh = Promise.resolve().then(load);
    }
    const pending = this.pendingRefresh;
    try { return await pending; }
    finally { if (this.pendingRefresh === pending) this.pendingRefresh = null; }
  }
}
