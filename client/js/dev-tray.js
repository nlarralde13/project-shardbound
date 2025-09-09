// static/js/dev-tray.js
(function(){
  const GRID_ID = "devTrayGrid";
  const MIME = "application/x-shard-item";
  // FIX: point at your real assets path
  const ICON_BASE = "/static/assets/items/";

  const ITEMS = [
    { id:"iron_sword",     name:"Iron Sword",     kind:"weapon",    icon: ICON_BASE + "iron_sword.png" },
    { id:"buckler",        name:"Buckler",        kind:"shield",    icon: ICON_BASE + "buckler.png" },
    { id:"leather_jerkin", name:"Leather Jerkin", kind:"armor",     icon: ICON_BASE + "leather_jerkin.png" },
    { id:"ripped_pants",   name:"Ripped Pants",   kind:"pants",     icon: ICON_BASE + "ripped_pants.png" },
    { id:"torch",          name:"Torch",          kind:"tool",      icon: ICON_BASE + "torch.png" },
    { id:"bread",          name:"Bread",          kind:"consumable",icon: ICON_BASE + "bread.png" },
    { id:"bandage",        name:"Bandage",        kind:"consumable",icon: ICON_BASE + "bandage.png" },
    { id:"health_potion",  name:"Potion",         kind:"consumable",icon: ICON_BASE + "health_potion.png" },
    { id:"whetstone",      name:"Whetstone",      kind:"tool",      icon: ICON_BASE + "whetstone.png" },
    { id:"oak_wood",       name:"Oak Wood",       kind:"material",  icon: ICON_BASE + "oak_wood.png" },
  ];

  function setDrag(dt, item){
    const j = JSON.stringify(item);
    dt.setData(MIME, j);
    dt.setData("text/plain", j);
    dt.effectAllowed = "copyMove";
  }

  function tile(item){
    const d = document.createElement("div");
    d.className = "dev-item";
    d.title = item.name;
    d.draggable = true;
    d.innerHTML = `<img alt="${item.name}" src="${item.icon}">`;
    d.addEventListener("dragstart", (e) => setDrag(e.dataTransfer, item));
    return d;
  }

  window.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return;
    ITEMS.forEach(it => grid.appendChild(tile(it)));
  });
})();
