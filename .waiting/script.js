(() => {
  const root = document.documentElement;
  const buttons = Array.from(document.querySelectorAll('[data-lang-button]'));
  const panels = Array.from(document.querySelectorAll('[data-lang-panel]'));
  const title = document.querySelector('[data-page-title]');
  const statusCopy = document.querySelector('[data-status-copy]');
  const storageKey = 'qoe-waiting-lang';

  const texts = {
    en: {
      title: 'qoe.fi is coming soon',
      status: 'A bilingual, minimal waiting page with calm editorial energy.'
    },
    fr: {
      title: 'qoe.fi arrive bientôt',
      status: 'Une page d’attente bilingue, minimaliste et éditoriale.'
    }
  };

  const getPreferredLang = () => {
    const fromDom = root.dataset.lang;
    if (fromDom === 'en' || fromDom === 'fr') {
      return fromDom;
    }

    const fromStorage = window.localStorage.getItem(storageKey);
    if (fromStorage === 'en' || fromStorage === 'fr') {
      return fromStorage;
    }

    return 'en';
  };

  const setLang = (lang, persist = true) => {
    const nextLang = lang === 'fr' ? 'fr' : 'en';
    root.dataset.lang = nextLang;
    root.lang = nextLang;

    if (title) {
      title.textContent = texts[nextLang].title;
    }

    if (statusCopy) {
      statusCopy.textContent = texts[nextLang].status;
    }

    buttons.forEach((button) => {
      const active = button.dataset.langButton === nextLang;
      button.setAttribute('aria-pressed', String(active));
      button.toggleAttribute('data-active', active);
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.langPanel !== nextLang;
    });

    if (persist) {
      window.localStorage.setItem(storageKey, nextLang);
    }

    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLang);
    window.history.replaceState({}, '', url);
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextLang = button.dataset.langButton;
      if (nextLang) {
        setLang(nextLang);
      }
    });
  });

  setLang(getPreferredLang(), false);
})();
