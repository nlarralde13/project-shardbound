/* tileInfoPanel.js
   Displays selected tile JSON and exposes dev editing controls.
   Public events: dispatches 'tile:apply' and 'tile:push'; listens for 'map:select'.
*/

const pre = document.getElementById('tile-json');
const formWrap = document.getElementById('tile-form-wrap');
const textarea = document.getElementById('tile-form');
const btnValidate = document.getElementById('btn-validate');
const btnApply = document.getElementById('btn-apply');
const btnPush = document.getElementById('btn-push');

const devMode = true;
if (devMode) formWrap.hidden = false;

document.addEventListener('map:select', (e) => {
  const tile = e.detail;
  const json = JSON.stringify(tile, null, 2);
  pre.textContent = json;
  textarea.value = json;
});

btnValidate?.addEventListener('click', () => {
  try {
    JSON.parse(textarea.value);
    alert('Valid JSON');
  } catch (err) {
    alert('Invalid JSON');
  }
});

btnApply?.addEventListener('click', () => {
  try {
    const data = JSON.parse(textarea.value);
    document.dispatchEvent(new CustomEvent('tile:apply', { detail: data }));
  } catch (err) {
    alert('Invalid JSON');
  }
});

btnPush?.addEventListener('click', () => {
  try {
    const data = JSON.parse(textarea.value);
    document.dispatchEvent(new CustomEvent('tile:push', { detail: data }));
  } catch (err) {
    alert('Invalid JSON');
  }
});

