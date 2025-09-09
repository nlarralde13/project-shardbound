// static/js/user-chip.js
(() => {
  const elChip  = document.getElementById("userChip");
  if (!elChip) return;

  const elBtn   = elChip.querySelector(".user-chip-btn");
  const elMenu  = document.getElementById("userMenu");

  const elName      = elChip.querySelector("#chipName");
  const elAvatarBox = elChip.querySelector(".avatar");
  const elInitials  = elChip.querySelector(".initials");

  const btnToggleFree = elMenu?.querySelector('[data-action="toggle-free"]');
  const btnReset      = elMenu?.querySelector('[data-action="reset-layout"]');

  const LS_KEY = "ui.lastUser";

  function initialsFrom(s=""){
    s = (s||"").trim();
    if (!s) return "?";
    if (s.includes("@")) return s[0].toUpperCase();
    const p = s.split(/\s+/).filter(Boolean);
    if (p.length === 1) return p[0].slice(0,2).toUpperCase();
    return (p[0][0]+p[p.length-1][0]).toUpperCase();
  }

  function setUser(u){
    const name = u.fullname || u.username || u.email || "Guest";
    if (elName) elName.textContent = name;

    const inits = initialsFrom(u.fullname || u.username || u.email);
    if (elInitials) elInitials.textContent = inits;

    // optional avatar support (inject <img> inside .avatar)
    const url = (u.avatar||"").trim();
    let img = elAvatarBox?.querySelector("img");
    if (url) {
      if (!img) {
        img = document.createElement("img");
        img.className = "avatar-img";
        img.alt = inits;
        elAvatarBox?.prepend(img);
      }
      img.src = url;
      if (elInitials) elInitials.style.opacity = "0";
    } else {
      if (img) img.remove();
      if (elInitials) elInitials.style.opacity = "1";
    }

    try { localStorage.setItem(LS_KEY, JSON.stringify({ name, initials: inits, avatar: url })); } catch {}
  }

  async function fetchUser(){
    const ds = elChip.dataset || {};
    if (ds.username || ds.fullname || ds.email || ds.avatar) {
      setUser({ username: ds.username, fullname: ds.fullname, email: ds.email, avatar: ds.avatar });
      return;
    }
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (r.ok) {
        const j = await r.json();
        setUser({
          username: j.username || j.user || "",
          fullname: j.name || j.full_name || "",
          email:    j.email || "",
          avatar:   j.avatar_url || j.avatar || ""
        });
        return;
      }
    } catch {}
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (cached.name) { setUser({ fullname: cached.name, avatar: cached.avatar || "" }); return; }
    } catch {}
    setUser({ username: "Guest" });
  }

  function refreshLayoutLabels(){
    const api = window.panelsAPI;
    const free = api?.isFree?.() || false;
    if (btnToggleFree) {
      btnToggleFree.textContent = free ? "Dock panels" : "Free layout";
      btnToggleFree.disabled = !api;
    }
    if (btnReset) btnReset.disabled = !api;
  }

  function toggleMenu(show){
    const open = show ?? elMenu.hidden;
    elMenu.hidden = !open;
    elBtn?.setAttribute("aria-expanded", String(open));
    if (open) refreshLayoutLabels();
  }

  function setupMenu(){
    elBtn?.addEventListener("click", (e) => { e.preventDefault(); toggleMenu(); });
    document.addEventListener("click", (e) => { if (!elChip.contains(e.target)) toggleMenu(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleMenu(false); });

    elMenu?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-action]");
      if (!b) return;
      const act = b.dataset.action;
      const api = window.panelsAPI;

      if (act === "toggle-free" && api) {
        api.enableFreeLayout(!api.isFree());
        refreshLayoutLabels();
      } else if (act === "reset-layout") {
        if (api?.resetToDefaultLayout) {
          if (!api.isFree()) api.enableFreeLayout(true);
          api.resetToDefaultLayout();
        } else {
          // fallback clear
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith("ui.panelPos.")) localStorage.removeItem(k);
          }
        }
        toggleMenu(false);
      }
      // "account"/"settings" can be wired later
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    fetchUser();
    setupMenu();
    refreshLayoutLabels();
  });
})();
