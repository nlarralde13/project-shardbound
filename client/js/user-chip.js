// static/js/user-chip.js
const elChip = document.getElementById("userChip");
const elBtn  = document.getElementById("userChipBtn");
const elMenu = document.getElementById("userMenu");
const elName = document.getElementById("userName");
const elInit = document.getElementById("userInitials");
const elImg  = document.getElementById("userAvatar");

// layout controls inside the menu
const btnMode  = document.getElementById("menuMode");
const btnLock  = document.getElementById("menuLock");
const btnReset = document.getElementById("menuReset");

const LS_KEY = "ui.lastUser";
const POS_PREFIX = "ui.panelPos."; // fallback clear key prefix (panels.js uses this)

/* -------------------- identity -------------------- */
function initialsFrom(nameOrEmail = "") {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  if (s.includes("@")) return s[0].toUpperCase();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function setUser(u) {
  const name = u.fullname || u.username || u.email || "Guest";
  elName.textContent = name;
  const initials = initialsFrom(u.fullname || u.username || u.email);
  elInit.textContent = initials;

  if (u.avatar && typeof u.avatar === "string" && u.avatar.trim()) {
    elImg.src = u.avatar;
    elImg.style.display = "block";
    elInit.style.opacity = "0";
  } else {
    elImg.removeAttribute("src");
    elImg.style.display = "none";
    elInit.style.opacity = "1";
  }

  try { localStorage.setItem(LS_KEY, JSON.stringify({ name, initials, avatar: u.avatar || "" })); } catch {}
}

async function fetchUser() {
  const ds = elChip?.dataset || {};
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
        email: j.email || "",
        avatar: j.avatar_url || j.avatar || ""
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

/* -------------------- menu -------------------- */
function toggleMenu(show) {
  const open = show ?? elMenu.hidden;
  elMenu.hidden = !open;
  elBtn.setAttribute("aria-expanded", String(open));
  if (open) refreshLayoutLabels();
}

function clearLocalPositions() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(POS_PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}

function refreshLayoutLabels() {
  const api = window.panelsAPI;
  const free = api?.isFree?.() || false;
  const locked = api?.isLocked?.() || false;

  if (btnMode) btnMode.textContent = free ? "Dock panels" : "Free layout";
  if (btnLock) btnLock.textContent = locked ? "Unlock panels" : "Lock panels";

  // Disable items gracefully if API not available
  [btnMode, btnLock, btnReset].forEach(b => { if (b) b.disabled = !api; });
}

function setupMenu() {
  elBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!elChip.contains(e.target)) toggleMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleMenu(false);
  });

  btnMode?.addEventListener("click", () => {
    const api = window.panelsAPI; if (!api) return;
    api.enableFreeLayout(!api.isFree());
    refreshLayoutLabels();
  });

  btnLock?.addEventListener("click", () => {
    const api = window.panelsAPI; if (!api) return;
    api.setLocked(!api.isLocked());
    refreshLayoutLabels();
  });

  btnReset?.addEventListener("click", () => {
    const api = window.panelsAPI;
    if (api?.resetToDefaultLayout) {
      if (!api.isFree()) api.enableFreeLayout(true);
      api.resetToDefaultLayout();
    } else {
      // Fallback: clear saved positions and force free mode to re-seed
      clearLocalPositions();
      if (!api?.isFree?.()) api?.enableFreeLayout?.(true);
    }
    toggleMenu(false);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  fetchUser();
  setupMenu();
});
