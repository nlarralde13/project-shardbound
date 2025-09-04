/**
 * Inspector Panel: shows Tile or POI properties with Apply/Revert/Delete.
 */
export function createInspector({ mount, tools, onApply, onDelete, onPickTarget }) {
  let current = null; // { kind: 'tile'|'poi', data }
  mount.innerHTML = '';
  const title = document.createElement('h3'); title.textContent = 'Inspector'; mount.appendChild(title);
  const body = document.createElement('div'); body.className = 'inspector-body'; mount.appendChild(body);
  const actions = document.createElement('div'); actions.className = 'inspector-actions'; mount.appendChild(actions);
  const btnApply = addBtn(actions, 'Apply'); const btnRevert = addBtn(actions, 'Revert'); const btnDelete = addBtn(actions, 'Delete');
  btnApply.addEventListener('click', () => {
    if (!current) return;
    if (current.kind === 'tile') {
      const tile = readTileForm(body); onApply?.({ kind:'tile', x: current.data.x, y: current.data.y, tile });
    } else if (current.kind === 'poi') {
      const poi = readPOIForm(body); onApply?.({ kind:'poi', poi });
    }
  });
  btnRevert.addEventListener('click', () => current && (current.kind === 'tile' ? inspectTile(current.data) : inspectPOI(current.data)));
  btnDelete.addEventListener('click', () => { if (current?.kind==='poi') onDelete?.(current.data.id); });

  function addBtn(p, label){ const b=document.createElement('button'); b.textContent=label; p.appendChild(b); return b; }

  function readTileForm(root){
    return {
      biome: root.querySelector('[name=biome]')?.value || 'bedrock',
      elevation: Number(root.querySelector('[name=elevation]')?.value || 0),
      tags: root.querySelector('[name=tags]')?.value?.split(',').map(s=>s.trim()).filter(Boolean) || [],
      resources: root.querySelector('[name=resources]')?.value?.split(',').map(s=>s.trim()).filter(Boolean) || [],
      flags: {
        buildable: root.querySelector('[name=flag_buildable]')?.checked || false,
        blocked: root.querySelector('[name=flag_blocked]')?.checked || false,
        water: root.querySelector('[name=flag_water]')?.checked || false,
        spawn: root.querySelector('[name=flag_spawn]')?.checked || false,
      }
    };
  }
  function readPOIForm(root){
    const poi = { id: current.data.id };
    poi.type = root.querySelector('[name=poi_type]')?.value || 'note';
    poi.name = root.querySelector('[name=name]')?.value || '';
    poi.description = root.querySelector('[name=description]')?.value || '';
    poi.icon = root.querySelector('[name=icon]')?.value || poi.type;
    poi.x = Number(root.querySelector('[name=x]')?.value || 0);
    poi.y = Number(root.querySelector('[name=y]')?.value || 0);
    poi.meta = {
      target_shard_id: root.querySelector('[name=target_shard_id]')?.value || undefined,
      target_x: numOrUndef(root.querySelector('[name=target_x]')?.value),
      target_y: numOrUndef(root.querySelector('[name=target_y]')?.value),
    };
    return poi;
  }
  function numOrUndef(v){ const n=Number(v); return Number.isFinite(n)?n:undefined; }

  function renderTileForm(t){
    body.innerHTML = `
      <div class="row"><label>Tile</label><div>(${t.x}, ${t.y})</div></div>
      <div class="row"><label>Biome</label><input name="biome" value="${t.biome}" /></div>
      <div class="row"><label>Elevation</label><input name="elevation" type="number" value="${t.elevation|0}" /></div>
      <div class="row"><label>Tags</label><input name="tags" value="${(t.tags||[]).join(', ')}" /></div>
      <div class="row"><label>Resources</label><input name="resources" value="${(t.resources||[]).join(', ')}" /></div>
      <div class="row flags">
        <label>Flags</label>
        <div class="flags">
          <label class="chk"><input type="checkbox" name="flag_buildable" ${t.flags?.buildable?'checked':''}/> buildable</label>
          <label class="chk"><input type="checkbox" name="flag_blocked" ${t.flags?.blocked?'checked':''}/> blocked</label>
          <label class="chk"><input type="checkbox" name="flag_water" ${t.flags?.water?'checked':''}/> water</label>
          <label class="chk"><input type="checkbox" name="flag_spawn" ${t.flags?.spawn?'checked':''}/> spawn</label>
        </div>
      </div>`;
  }
  function renderPOIForm(p){
    body.innerHTML = `
      <div class="row"><label>POI</label><div>#${p.id.slice(0,8)}</div></div>
      <div class="row"><label>Type</label><input name="poi_type" value="${p.type}" /></div>
      <div class="row"><label>Name</label><input name="name" value="${p.name||''}" /></div>
      <div class="row"><label>Icon</label><input name="icon" value="${p.icon||p.type}" /></div>
      <div class="row"><label>Description</label><textarea name="description">${p.description||''}</textarea></div>
      <div class="row"><label>Pos</label>
        <div class="xy">
          <input name="x" type="number" value="${p.x}" />
          <input name="y" type="number" value="${p.y}" />
        </div>
      </div>
      ${p.type==='shardgate' ? gateForm(p) : ''}
    `;
    if (p.type==='shardgate') {
      const btn = document.createElement('button'); btn.textContent = 'Pick target on map'; btn.type='button';
      btn.title = 'Click to choose a tile for target_x/target_y (ESC to cancel)';
      btn.addEventListener('click', (e) => { e.preventDefault(); onPickTarget?.((pt)=>{
        const tx = body.querySelector('[name=target_x]'); const ty = body.querySelector('[name=target_y]');
        if (tx) tx.value = pt.x; if (ty) ty.value = pt.y;
      }); });
      body.appendChild(btn);
    }
  }
  function gateForm(p){
    const m = p.meta||{};
    return `
      <div class="row"><label>Target Shard</label><input name="target_shard_id" value="${m.target_shard_id||''}" /></div>
      <div class="row"><label>Target Pos</label><div class="xy"><input name="target_x" type="number" value="${m.target_x??''}" /><input name="target_y" type="number" value="${m.target_y??''}" /></div></div>
    `;
  }

  function inspectTile(tile){ current = { kind:'tile', data: tile }; renderTileForm(tile); }
  function inspectPOI(poi, onApplyCb){ current = { kind:'poi', data: poi }; renderPOIForm(poi); }
  function showWelcome(){ body.innerHTML = '<div class="muted">Select a tile or POI.</div>'; }

  // expose API
  return { inspectTile, inspectPOI, showWelcome };
}
