/**
 * Lightweight context menu with keyboard navigation and a Place submenu.
 * Exposes open/close and onSelect callback.
 *
 * @param {{ onSelect?: (selection: { type: string, tile: {x:number,y:number}, defaults:any }) => void }} opts
 */
export function createContextMenu(opts = {}) {
  const onSelect = opts.onSelect;
  const root = document.createElement('div');
  root.className = 'ctx-menu';
  root.style.display = 'none';
  document.body.appendChild(root);

  let active = false; let submenu = null; let items = []; let focusIdx = 0; let currentTile = { x:0, y:0 };

  function close(){ active=false; root.style.display='none'; root.innerHTML=''; removeSubmenu(); }
  function removeSubmenu(){ submenu?.remove?.(); submenu=null; }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function focusItem(i){ focusIdx = clamp(i, 0, items.length-1); items[focusIdx]?.focus?.(); }

  function buildMenu(screen){
    root.innerHTML = '';
    const mPlace = document.createElement('button'); mPlace.textContent='Place ▸'; mPlace.className='ctx-item'; mPlace.setAttribute('aria-haspopup','true'); mPlace.tabIndex=0; root.appendChild(mPlace);
    const hr = document.createElement('div'); hr.className='ctx-sep'; root.appendChild(hr);
    const cancel = document.createElement('button'); cancel.textContent='Cancel'; cancel.className='ctx-item'; cancel.tabIndex=0; root.appendChild(cancel);

    items = [mPlace, cancel]; focusItem(0);

    const openSub = () => {
      removeSubmenu();
      submenu = document.createElement('div'); submenu.className='ctx-submenu'; document.body.appendChild(submenu);
      const entries = [
        { label:'Shardgate', type:'shardgate' },
        { label:'Settlement', type:'settlement' },
        { label:'Dungeon Entrance', type:'dungeon_entrance' },
        { label:'Biome', type:'biome' },
        { label:'Infrastructure', type:'infrastructure' },
      ];
      for (const e of entries){
        const b = document.createElement('button'); b.className='ctx-item'; b.textContent=e.label; b.tabIndex=0;
        b.addEventListener('click', () => { emit(e.type); });
        submenu.appendChild(b);
      }
      const rb = root.getBoundingClientRect();
      const sbw = 220; const sbh = entries.length*30 + 12;
      const left = (rb.right + sbw < window.innerWidth) ? rb.right : Math.max(0, rb.left - sbw);
      const top = (rb.top + sbh < window.innerHeight) ? rb.top : Math.max(0, window.innerHeight - sbh);
      submenu.style.left = left + 'px'; submenu.style.top = top + 'px';
    };
    const closeSub = () => removeSubmenu();

    mPlace.addEventListener('mouseenter', openSub);
    mPlace.addEventListener('click', openSub);
    cancel.addEventListener('click', close);

    root.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(focusIdx+1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(focusIdx-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); openSub(); submenu?.querySelector('button')?.focus(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); closeSub(); return; }
      if (e.key === 'Enter') { e.preventDefault(); items[focusIdx]?.click?.(); }
    };

    const w = 200, h = 120;
    const left = (screen.left + w < window.innerWidth) ? screen.left : Math.max(0, screen.left - w);
    const top = (screen.top + h < window.innerHeight) ? screen.top : Math.max(0, screen.top - h);
    root.style.left = left + 'px'; root.style.top = top + 'px';
  }

  function emit(type){
    const defaults = defaultsFor(type);
    onSelect?.({ type, tile: currentTile, defaults });
    close();
  }
  function defaultsFor(type){
    switch(type){
      case 'shardgate': return { name:'New Shardgate', meta:{ target_shard_id:'', target_x:null, target_y:null } };
      case 'settlement': return { name:'New Settlement', size:'hamlet' };
      case 'dungeon_entrance': return { name:'New Dungeon Entrance', depth:1 };
      case 'biome': return { biome:'forest' };
      case 'infrastructure': return { kind:'road' };
      default: return {};
    }
  }

  /** Open menu at screen coords for a tile. */
  function open({ tile, screen }){
    active = true; currentTile = { x: tile.x|0, y: tile.y|0 };
    buildMenu(screen);
    root.style.display = 'block';
    items[0]?.focus?.();
  }

  const closeOn = () => active && close();
  window.addEventListener('scroll', closeOn, { passive:true });
  window.addEventListener('resize', closeOn);
  window.addEventListener('click', (e)=>{ if (!root.contains(e.target)) closeOn(); });
  window.addEventListener('wheel', closeOn, { passive:true });

  return { open, close };
}

