(() => {
  const toggle = document.getElementById('btnSidebarToggle');
  const sidebar = document.getElementById('clientSidebar');
  toggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed');
  });

  const actions = [
    ['btnLook', 'Look'],
    ['btnInteract', 'Interact'],
    ['btnRest', 'Rest']
  ];
  actions.forEach(([id, label]) => {
    document.getElementById(id)?.addEventListener('click', () => console.log(label));
  });
})();
