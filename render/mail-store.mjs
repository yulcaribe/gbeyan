// Disposable mail snapshots. Folder defaults are supplied by environment variables.
export class MailStore {
  snapshot = null;
  settings = null;
  pendingRefresh = null;

  async getMailSnapshot() { return this.snapshot; }
  async saveMailSnapshot(snapshot) {
    this.snapshot = snapshot;
    return { cachedAt: snapshot?.cachedAt || null };
  }
  async clearMailSnapshot() { this.snapshot = null; }
  async getMailSettings() { return this.settings; }
  async saveMailSettings(settings) { this.settings = { ...settings }; return this.settings; }

  async runRefresh(load) {
    if (!this.pendingRefresh) {
      this.pendingRefresh = Promise.resolve().then(load);
    }
    const pending = this.pendingRefresh;
    try { return await pending; }
    finally { if (this.pendingRefresh === pending) this.pendingRefresh = null; }
  }
}
