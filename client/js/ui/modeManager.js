// Simple mode manager
export class ModeManager {
  constructor() { this.mode = 'overworld'; }
  setMode(m) { this.mode = m; document.body.dataset.mode = m; }
  getMode() { return this.mode; }
}
