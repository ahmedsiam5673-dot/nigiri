(async function () {
  const N = window.Nigiri;
  N.settings = await N.api.settings.get();
  N.applySound();
  N.init();
  N.modules.home.init();
  await N.modules.settings.init();
  await N.modules.chat.init();
  N.showTab('home');
  N.refreshMini();
  N.refreshBase();

  // a small hello when the island appears
  setTimeout(() => {
    N.flash('wink', 2200);
    Sounds.play('hello');
  }, 500);
})();
