// js/store.js
// Global Alpine store: auth state, current event, notifications

document.addEventListener('alpine:init', () => {

  Alpine.store('auth', {
    user: null,
    session: null,
    loading: true,

    async init() {
      const { data: { session } } = await db.auth.getSession();
      if (session) {
        this.session = session;
        this.user = session.user;
      }
      this.loading = false;

      db.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        this.user = session?.user || null;
      });
    },

    async login(email, password) {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.session = data.session;
      this.user = data.user;
    },

    async logout() {
      await db.auth.signOut();
      this.session = null;
      this.user = null;
      window.location.hash = '#/login';
    },

    get isAuthenticated() {
      return !!this.user;
    }
  });

  Alpine.store('notify', {
    message: '',
    type: 'info', // 'info' | 'success' | 'error'
    visible: false,
    _timeout: null,

    show(message, type = 'info', duration = 4000) {
      this.message = message;
      this.type = type;
      this.visible = true;
      clearTimeout(this._timeout);
      this._timeout = setTimeout(() => { this.visible = false; }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 6000); },
    info(msg) { this.show(msg, 'info'); },
  });

});
