export class GpuTimers {
  constructor(gl) {
    this.gl = gl; this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = []; this.samples = {}; this.active = null;
  }
  begin(name) {
    if (!this.extension || this.active || this.pending.length > 80) return;
    const query = this.gl.createQuery(); this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query); this.active = { name, query };
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT); this.pending.push(this.active); this.active = null;
  }
  measure(name, draw) { this.begin(name); try { return draw(); } finally { this.end(); } }
  poll() {
    if (!this.extension) return;
    const disjoint = this.gl.getParameter(this.extension.GPU_DISJOINT_EXT);
    this.pending = this.pending.filter(({ name, query }) => {
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!disjoint) {
        const ms = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) / 1e6;
        const sample = this.samples[name] ?? { count: 0, mean: ms, min: ms, max: ms };
        sample.count++; sample.mean += (ms - sample.mean) / Math.min(60, sample.count); sample.min = Math.min(sample.min, ms); sample.max = Math.max(sample.max, ms);
        this.samples[name] = sample;
      }
      this.gl.deleteQuery(query); return false;
    });
  }
  report() {
    return { supported: Boolean(this.extension), passes: structuredClone(this.samples),
      totalMs: this.extension && Object.keys(this.samples).length ? Object.values(this.samples).reduce((sum, item) => sum + item.mean, 0) : null };
  }
  dispose() { this.end(); for (const { query } of this.pending) this.gl.deleteQuery(query); this.pending = []; }
}
