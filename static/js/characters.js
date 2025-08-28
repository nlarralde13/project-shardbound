// static/js/characters.js
import { API } from "/static/js/api.js";

function el(id) { return document.getElementById(id); }

async function bootSelect() {
  const deck = el("charDeck");
  if (!deck) return; // we're not on the select page

  // guard: must be logged in
  try { await API.me(); } catch { location.href = "/"; return; }

  const chars = await API.charactersList().catch(() => []);
  deck.innerHTML = "";

  if (!chars.length) {
    el("emptyState").style.display = "block";
    return;
  }

  chars.forEach(c => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${c.name}</h3>
      <div class="dim">${c.class_id || "—"} • Lv ${c.level ?? 1}</div>
      <div class="dim" style="margin-top:6px;">${c.bio ? c.bio.substring(0, 96) : ""}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button class="btn" data-id="${c.character_id}">Play</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", async () => {
      await API.characterSelect(c.character_id);
      location.href = "/mvp";
    });
    deck.appendChild(card);
  });
}

async function bootCreate() {
  const form = document.getElementById("createForm");
  if (!form) return; // not on create page

  try { await API.me(); } catch { location.href = "/"; return; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: el("c_name").value.trim(),
      class_id: el("c_class").value,
      sex: el("c_sex").value,
      age: parseInt(el("c_age").value || "0", 10) || null,
      bio: el("c_bio").value.trim()
    };
    const msg = el("msg");
    try {
      await API.characterCreate(payload);
      msg.textContent = "Created!";
      location.href = "/mvp";
    } catch (err) {
      msg.textContent = err.message || "Failed to create character";
    }
  });
}

(async () => {
  await bootSelect();
  await bootCreate();
})();
