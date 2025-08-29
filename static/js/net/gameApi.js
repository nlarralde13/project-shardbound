export async function apiFetch(path, opts={}) {
  const res = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts});
  return res.json();
}
export const createCharacter = (payload) => apiFetch('/api/game/characters', {method:'POST', body:JSON.stringify(payload)});
export const enterTown = (id) => apiFetch(`/api/game/characters/${id}/enter_town`, {method:'POST'});
export const townMove = (id, payload) => apiFetch(`/api/game/characters/${id}/town_move`, {method:'POST', body:JSON.stringify(payload)});
export const leaveTown = (id) => apiFetch(`/api/game/characters/${id}/leave_town`, {method:'POST'});
export const talk = (id, payload) => apiFetch(`/api/game/characters/${id}/talk`, {method:'POST', body:JSON.stringify(payload)});
export const move = (id, payload) => apiFetch(`/api/game/characters/${id}/move`, {method:'POST', body:JSON.stringify(payload)});
export const encounterStart = (payload) => apiFetch('/api/game/encounters/start', {method:'POST', body:JSON.stringify(payload)});
export const encounterTurn = (payload) => apiFetch('/api/game/encounters/turn', {method:'POST', body:JSON.stringify(payload)});
