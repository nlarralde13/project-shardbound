// editor 1.2.5 — Centered draw; strict clamp; clip grid to map rect; add screenToTile()

export class ShardGridRenderer {
  constructor(canvas, { cell = 12 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha:false });
    this.ctx.imageSmoothingEnabled = false;

    this.cell = cell;
    this.cam = { x: 0, y: 0, scale: 1 };
    this.minScale = 0.2;
    this.maxScale = 8;

    this._dpr = Math.max(1, window.devicePixelRatio || 1);

    this.shard = null;
    this.selected = null;
    this.preview = null;

    this._bindIO();
    this._resize();
    requestAnimationFrame(()=>this._resize());
  }

  _bindIO() {
    const c = this.canvas;

    // cursor-anchored zoom
    c.addEventListener('wheel', (e)=>{
      e.preventDefault();
      const old = this.cam.scale;
      const k = 1 + Math.min(0.5, Math.abs(e.deltaY)/500);
      let ns = e.deltaY<0 ? old*k : old/k;
      ns = Math.max(this.minScale, Math.min(this.maxScale, ns));

      const rect = c.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const wx = (px - this.cam.x) / (this.cell * old);
      const wy = (py - this.cam.y) / (this.cell * old);

      this.cam.scale = ns;
      this.cam.x = px - wx * this.cell * ns;
      this.cam.y = py - wy * this.cell * ns;

      this._clampCam();
      this.redraw();
    }, { passive:false });

    // RMB/MMB pan
    let panning=false, start={x:0,y:0}, base={x:0,y:0};
    c.addEventListener('mousedown', (e)=>{
      if (e.button===1 || e.button===2) {
        panning = true;
        const r = c.getBoundingClientRect();
        start = { x:e.clientX-r.left, y:e.clientY-r.top };
        base = { x:this.cam.x, y:this.cam.y };
        e.preventDefault();
      }
    });
    window.addEventListener('mousemove', (e)=>{
      if (!panning) return;
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      this.cam.x = base.x + (px - start.x);
      this.cam.y = base.y + (py - start.y);
      this._clampCam();
      this.redraw();
    });
    window.addEventListener('mouseup', ()=>{ panning=false; });
    c.addEventListener('contextmenu', (e)=>e.preventDefault());

    window.addEventListener('resize', ()=>this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.max(1, Math.floor(rect.width  * this._dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this._dpr));
    this.ctx.setTransform(this._dpr,0,0,this._dpr,0,0);
    if (this.shard) this.fitToShard(this.shard.width, this.shard.height, { paddingTiles:2, setAsMin:true });
    this.redraw();
  }

  _clampCam() {
  if (!this.shard) return;
  const rect = this.canvas.getBoundingClientRect();
  const ts = this.cell * this.cam.scale;
  const mapW = this.shard.width  * ts;
  const mapH = this.shard.height * ts;

  const loX = Math.min(0, rect.width  - mapW);
  const hiX = Math.max(0, rect.width  - mapW);
  const loY = Math.min(0, rect.height - mapH);
  const hiY = Math.max(0, rect.height - mapH);

  this.cam.x = Math.max(loX, Math.min(hiX, this.cam.x));
  this.cam.y = Math.max(loY, Math.min(hiY, this.cam.y));
}


  setData(shard){ this.shard = shard; this.redraw(); }
  setSelected(sel){ this.selected = sel; this.redraw(); }
  setPreview(p){ this.preview = p; this.redraw(); }
  clearPreview(){ this.preview = null; this.redraw(); }

  // Center & lock min zoom
  fitToShard(w, h, { paddingTiles=2, setAsMin=true } = {}) {
    const rect = this.canvas.getBoundingClientRect();
    const availW = rect.width  - paddingTiles*2*this.cell;
    const availH = rect.height - paddingTiles*2*this.cell;
    const sX = availW / (w*this.cell);
    const sY = availH / (h*this.cell);
    const s = Math.max(0.2, Math.min(this.maxScale, Math.min(sX,sY)));
    this.cam.scale = s;
    if (setAsMin) this.minScale = s;

    const contentW = w*this.cell*s, contentH = h*this.cell*s;
    this.cam.x = Math.round((rect.width  - contentW)/2);
    this.cam.y = Math.round((rect.height - contentH)/2);
    this._clampCam();
  }

  centerOn(x,y){
    if (!this.shard) return;
    const rect = this.canvas.getBoundingClientRect();
    const ts = this.cell*this.cam.scale;
    const cx = (x+0.5)*ts, cy=(y+0.5)*ts;
    this.cam.x = Math.round(rect.width/2  - cx);
    this.cam.y = Math.round(rect.height/2 - cy);
    this._clampCam();
    this.redraw();
  }

  // convert screen to tile
  screenToTile(sx,sy){
    if (!this.shard) return null;
    const ts = this.cell*this.cam.scale;
    const tx = Math.floor((sx - this.cam.x) / ts);
    const ty = Math.floor((sy - this.cam.y) / ts);
    if (tx<0 || ty<0 || tx>=this.shard.width || ty>=this.shard.height) return null;
    return { x:tx, y:ty };
  }

  _snap(n){ return Math.round(n); }
  _biomeColor(id=''){
    if (id.startsWith('water/')) return '#123d6b';
    if (id.includes('forest')) return '#2f5d2f';
    if (id.includes('grass'))  return '#4f8e4f';
    if (id.includes('desert')||id.includes('sand')) return '#c2a766';
    if (id.includes('tundra')||id.includes('frozen')) return '#9aa7b0';
    if (id.includes('mountain')) return '#7a7a7a';
    if (id.includes('swamp')) return '#274a3a';
    return '#38543a';
  }

  redraw(){
    const ctx = this.ctx, c = this.canvas;
    // black background — middle column is black too
    ctx.fillStyle = '#000000';
    ctx.fillRect(0,0,c.width,c.height);

    if (!this.shard) return;
    const ts = this.cell*this.cam.scale;

    // Compute map rectangle on screen
    const mapX = this.cam.x, mapY = this.cam.y;
    const mapW = this.shard.width*ts, mapH = this.shard.height*ts;

    // Clip drawing to the map rectangle so no stripes render outside
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._snap(mapX), this._snap(mapY), Math.ceil(mapW), Math.ceil(mapH));
    ctx.clip();

    // tiles
    for (let y=0;y<this.shard.height;y++){
      const y0 = this._snap(mapY + y*ts);
      const y1 = this._snap(mapY + (y+1)*ts);
      const h  = y1 - y0;
      for (let x=0;x<this.shard.width;x++){
        const x0 = this._snap(mapX + x*ts);
        const x1 = this._snap(mapX + (x+1)*ts);
        const w  = x1 - x0;
        ctx.fillStyle = this._biomeColor(this.shard.tiles[y][x].biome||'');
        ctx.fillRect(x0,y0,w,h);
      }
    }

    // staged preview (semi-transparent)
    if (this.preview){
      const {x,y,biome} = this.preview;
      const x0=this._snap(mapX+x*ts), x1=this._snap(mapX+(x+1)*ts);
      const y0=this._snap(mapY+y*ts), y1=this._snap(mapY+(y+1)*ts);
      ctx.globalAlpha=0.6; ctx.fillStyle=this._biomeColor(biome||''); ctx.fillRect(x0,y0,x1-x0,y1-y0); ctx.globalAlpha=1;
    }

    // selection outline
    if (this.selected){
      const {x,y} = this.selected;
      const x0=this._snap(mapX+x*ts)+0.5, x1=this._snap(mapX+(x+1)*ts)-0.5;
      const y0=this._snap(mapY+y*ts)+0.5, y1=this._snap(mapY+(y+1)*ts)-0.5;
      ctx.strokeStyle='#f0c674'; ctx.lineWidth=1;
      ctx.strokeRect(x0,y0,x1-x0,y1-y0);
    }

    // grid within the map rect only
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
    for (let gx=0; gx<=this.shard.width; gx++){
      const sx = this._snap(mapX + gx*ts) + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, this._snap(mapY)); ctx.lineTo(sx, this._snap(mapY + this.shard.height*ts)); ctx.stroke();
    }
    for (let gy=0; gy<=this.shard.height; gy++){
      const sy = this._snap(mapY + gy*ts) + 0.5;
      ctx.beginPath(); ctx.moveTo(this._snap(mapX), sy); ctx.lineTo(this._snap(mapX + this.shard.width*ts), sy); ctx.stroke();
    }

    ctx.restore(); // remove clip
  }
}

export default ShardGridRenderer;
