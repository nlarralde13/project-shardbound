// Minimal console overlay for typing commands
export function setupConsole(handler) {
  const input = document.createElement('input');
  input.className = 'console-input';
  document.body.appendChild(input);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      handler(input.value);
      input.value = '';
    }
  });
}
