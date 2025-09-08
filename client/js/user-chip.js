// static/js/user-chip.js
const elChip = document.getElementById("userChip");
const elBtn  = document.getElementById("userChipBtn");
const elMenu = document.getElementById("userMenu");
const elName = document.getElementById("userName");
const elInit = document.getElementById("userInitials");
const elImg  = document.getElementById("userAvatar");

const LS_KEY = "ui.lastUser";

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

  // persist locally for instant fill next load
  try { localStorage.setItem(LS_KEY, JSON.stringify({ name, initials, avatar: u.avatar || "" })); } catch {}
}

async function fetchUser() {
  // 1) Jinja-provided data-* attributes
  const ds = elChip?.dataset || {};
  if (ds.username || ds.fullname || ds.email || ds.avatar) {
    setUser({ username: ds.username, fullname: ds.fullname, email: ds.email, avatar: ds.avatar });
    return;
  }

  // 2) Try server endpoint
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

  // 3) Fallback to last cached
  try {
    const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (cached.name) {
      setUser({ fullname: cached.name, avatar: cached.avatar || "" });
      return;
    }
  } catch {}

  // 4) Default guest
  setUser({ username: "Guest" });
}

function toggleMenu(show) {
  const open = show ?? elMenu.hidden;
  elMenu.hidden = !open;
  elBtn.setAttribute("aria-expanded", String(open));
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
}

window.addEventListener("DOMContentLoaded", () => {
  fetchUser();
  setupMenu();
});
