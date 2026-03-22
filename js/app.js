// js/app.js
// Consolidated admin app with all components and dependencies

// Supabase client initialization (from lib/supabase.js)
const SUPABASE_URL = 'https://calxwytlgkoooyypscry.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_5nR7-p9o_ORS-qjrMxj4GA_RKm732Gn'; 
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// For the new sb_publishable format, we need to use the newer import method
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * Call a Supabase Edge Function with auth header.
 */
async function callEdgeFunction(name, body) {
  const { data: { session } } = await db.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// QR Scanner class (from lib/qr-scanner.js)
class QRScanner {
  constructor(elementId) {
    this.elementId = elementId;
    this.scanner = null;
    this.isRunning = false;
    this.isInitializing = false;
    this.lastError = null;
    this.startTime = null;
    this.timeoutMs = 10000; // 10 second timeout
  }

  async start(onScan, onStatusChange) {
    if (this.isRunning || this.isInitializing) return;

    this.isInitializing = true;
    this.lastError = null;
    this.startTime = Date.now();
    
    if (onStatusChange) onStatusChange('initializing', 'Iniciando cámara...');

    try {
      // Check if camera is available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      if (cameras.length === 0) {
        throw new Error('No se encontraron cámaras en este dispositivo');
      }

      console.log('📷 Found cameras:', cameras.length);
      if (onStatusChange) onStatusChange('initializing', `Iniciando cámara (${cameras.length} encontradas)...`);

      this.scanner = new Html5Qrcode(this.elementId);
      
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera agotado al iniciar la cámara')), this.timeoutMs);
      });

      // Use the proven configuration
      const startPromise = this.scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (vw, vh) => {
            const size = Math.min(vw, vh) * 0.7;
            return { width: size, height: size };
          },
          aspectRatio: 1,
        },
        (decodedText) => {
          console.log('🔍 QR Code detected:', decodedText);
          onScan(decodedText);
        },
        (errorMessage) => {
          // Ignore scan errors (no QR found in frame)
          // This is normal behavior, so we don't log it
        }
      );

      await Promise.race([startPromise, timeoutPromise]);
      
      // Hide dashboard clutter injected by the library
      setTimeout(() => {
        const dash = document.getElementById(`${this.elementId}__dashboard`);
        if (dash) dash.style.display = 'none';
        const hdr = document.getElementById(`${this.elementId}__header_message`);
        if (hdr) hdr.style.display = 'none';
        
        // Hide any additional library elements
        const csr = document.getElementById(`${this.elementId}__dashboard_section_csr`);
        if (csr) csr.style.display = 'none';
        const fbp = document.getElementById(`${this.elementId}__dashboard_section_fbp`);
        if (fbp) fbp.style.display = 'none';
        
        // Hide duplicate videos and canvases
        const container = document.getElementById(this.elementId);
        if (container) {
          const videos = container.querySelectorAll('video');
          const canvases = container.querySelectorAll('canvas');
          
          // Keep only the first video, hide others
          videos.forEach((video, index) => {
            if (index > 0) {
              video.style.display = 'none';
            }
          });
          
          // Hide all canvases (they're for processing, not display)
          canvases.forEach(canvas => {
            canvas.style.display = 'none';
          });
        }
        
        console.log('🧹 Cleaned up library UI elements');
      }, 100);
      
      this.isRunning = true;
      this.isInitializing = false;
      const initTime = Date.now() - this.startTime;
      console.log(`✅ Camera started successfully in ${initTime}ms`);
      
      // Check if video element is actually showing
      setTimeout(() => {
        const videoElement = document.querySelector(`#${this.elementId} video`);
        if (videoElement) {
          console.log('📹 Video element found:', {
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
            readyState: videoElement.readyState,
            playing: !videoElement.paused && !videoElement.ended,
            visible: videoElement.offsetWidth > 0 && videoElement.offsetHeight > 0
          });
        } else {
          console.warn('⚠️ No video element found in scanner container');
        }
      }, 1000);
      
      if (onStatusChange) onStatusChange('active', 'Cámara activa - Escanea un código QR');

    } catch (err) {
      this.isInitializing = false;
      this.isRunning = false;
      this.lastError = err;
      const initTime = Date.now() - this.startTime;
      console.error(`❌ Camera failed to start after ${initTime}ms:`, err);
      
      let userMessage = 'Error al iniciar la cámara';
      if (err.message.includes('NotAllowedError')) {
        userMessage = 'Acceso a la cámara denegado. Por favor, permite el acceso a la cámara en tu navegador.';
      } else if (err.message.includes('NotFoundError')) {
        userMessage = 'No se encontraron cámaras. Conecta una cámara y recarga la página.';
      } else if (err.message.includes('Tiempo de espera')) {
        userMessage = 'La cámara tardó demasiado en iniciarse. Intenta recargar la página.';
      } else {
        userMessage = `Error: ${err.message}`;
      }
      
      if (onStatusChange) onStatusChange('error', userMessage);
      throw err;
    }
  }

  async stop() {
    if (!this.isRunning || !this.scanner) return;
    console.log('🛑 Stopping scanner...');
    try {
      await this.scanner.stop();
      console.log('✅ Scanner stopped successfully');
    } catch (err) {
      console.error('❌ Error stopping scanner:', err);
    }
    this.isRunning = false;
  }

  async dispose() {
    console.log('🗑️ Disposing scanner...');
    await this.stop();
    if (this.scanner) {
      try {
        this.scanner.clear();
      } catch (err) {
        console.error('❌ Error clearing scanner:', err);
      }
      this.scanner = null;
    }
    this.lastError = null;
    this.startTime = null;
  }

  // Get current status for debugging
  getStatus() {
    return {
      isRunning: this.isRunning,
      isInitializing: this.isInitializing,
      lastError: this.lastError?.message || null,
      elementId: this.elementId,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }
}

document.addEventListener('alpine:init', () => {

  Alpine.data('app', () => ({
    currentRoute: 'login',
    routeParams: {},
    ready: false,

    async init() {
      // Wait for auth to initialize
      await Alpine.store('auth').init();
      this.ready = true;
      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());
    },

    handleRoute() {
      const hash = window.location.hash || '#/login';
      const auth = Alpine.store('auth');

      // Parse route
      if (hash.match(/#\/events\/([a-zA-Z0-9-]+)\/orders\/([a-f0-9-]+)/)) {
        this.currentRoute = 'order-detail';
      } else if (hash.match(/#\/events\/([a-zA-Z0-9-]+)\/orders/)) {
        this.currentRoute = 'orders';
      } else if (hash.match(/#\/events\/([a-zA-Z0-9-]+)\/tickets/)) {
        this.currentRoute = 'tickets';
      } else if (hash.match(/#\/events\/([a-zA-Z0-9-]+)/)) {
        this.currentRoute = 'event-dashboard';
      } else if (hash.startsWith('#/events')) {
        this.currentRoute = 'events';
      } else if (hash.startsWith('#/scan')) {
        this.currentRoute = 'scanner';
      } else {
        this.currentRoute = 'login';
      }

      // Auth guard
      if (this.currentRoute !== 'login' && !auth.isAuthenticated) {
        window.location.hash = '#/login';
        this.currentRoute = 'login';
        return;
      }

      // Redirect authenticated users away from login
      if (this.currentRoute === 'login' && auth.isAuthenticated) {
        window.location.hash = '#/events';
        this.currentRoute = 'events';
      }
    },

    isRoute(route) {
      return this.currentRoute === route;
    }
  }));

  // Login Page Component (from pages/login.js)
  Alpine.data('loginPage', () => ({
    email: '',
    password: '',
    loading: false,
    error: null,

    async handleLogin() {
      this.error = null;
      this.loading = true;
      try {
        await Alpine.store('auth').login(this.email, this.password);
        window.location.hash = '#/events';
      } catch (err) {
        this.error = 'Credenciales incorrectas. Inténtalo de nuevo.';
      } finally {
        this.loading = false;
      }
    }
  }));

  // Events Page Component (from pages/events.js)
  Alpine.data('eventsPage', () => ({
    events: [],
    loading: true,
    showCreateForm: false,

    // Create form fields
    form: {
      name: '',
      description: '',
      venue: '',
      event_date: '',
      event_time: '20:00',
      duration_minutes: 120,
      total_seats: 100,
      image_url: '',
    },
    saving: false,

    async init() {
      await this.loadEvents();
    },

    async loadEvents() {
      this.loading = true;
      try {
        const { data, error } = await db
          .from('events')
          .select('*, ticket_types(count)')
          .order('event_date', { ascending: true });

        if (error) throw error;
        this.events = data || [];
      } catch (err) {
        Alpine.store('notify').error('Error al cargar eventos: ' + err.message);
      } finally {
        this.loading = false;
      }
    },

    formatDate(dateStr) {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    },

    eventStatus(event) {
      const now = new Date();
      const eventDate = new Date(event.event_date);
      const endDate = new Date(eventDate.getTime() + event.duration_minutes * 60000);

      if (now > endDate) return { label: 'Finalizado', class: 'badge--muted' };
      if (now >= new Date(event.open_time)) return { label: 'En curso', class: 'badge--success' };
      if (now >= new Date(event.sales_cutoff)) return { label: 'Ventas cerradas', class: 'badge--warning' };
      return { label: 'En venta', class: 'badge--info' };
    },

    toggleCreateForm() {
      this.showCreateForm = !this.showCreateForm;
      if (this.showCreateForm) {
        this.resetForm();
      }
    },

    resetForm() {
      this.form = {
        name: '', description: '', venue: '',
        event_date: '', event_time: '20:00',
        duration_minutes: 120, total_seats: 100, image_url: '',
        slug: '', // Add slug field
      };
    },

    // Slug generation function
    stringToSlug(str) {
      str = str.replace(/^\s+|\s+$/g, ''); // trim
      str = str.toLowerCase();
    
      // remove accents, swap ñ for n, etc
      var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
      var to   = "aaaaeeeeiiiioooouuuunc------";
      for (var i=0, l=from.length ; i<l ; i++) {
          str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
      }

      str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
          .replace(/\s+/g, '-') // collapse whitespace and replace by -
          .replace(/-+/g, '-'); // collapse dashes

      return str;
    },

    // Reactive methods for slug generation
    onTitleChangeCreate() {
      if (!this.form.slug || this.form.slug === this.stringToSlug(this.form.name)) {
        this.form.slug = this.stringToSlug(this.form.name);
      }
    },

    onTitleChangeEdit() {
      if (!this.editForm.slug || this.editForm.slug === this.stringToSlug(this.editForm.name)) {
        this.editForm.slug = this.stringToSlug(this.editForm.name);
      }
    },

    async createEvent() {
      if (!this.form.name || !this.form.venue || !this.form.event_date || !this.form.slug) {
        Alpine.store('notify').error('Nombre, lugar, fecha y slug son obligatorios');
        return;
      }

      this.saving = true;
      try {
        const eventDate = new Date(`${this.form.event_date}T${this.form.event_time}`);
        const openTime = new Date(eventDate.getTime() - 3600000); // -1 hour
        const salesCutoff = new Date(eventDate);

        const { error } = await db.from('events').insert({
          name: this.form.name,
          slug: this.form.slug,
          description: this.form.description,
          venue: this.form.venue,
          event_date: eventDate.toISOString(),
          duration_minutes: parseInt(this.form.duration_minutes),
          total_seats: parseInt(this.form.total_seats),
          available_seats: parseInt(this.form.total_seats),
          image_url: this.form.image_url || null,
          open_time: openTime.toISOString(),
          sales_cutoff: salesCutoff.toISOString(),
        });

        if (error) throw error;

        Alpine.store('notify').success('Evento creado correctamente');
        this.showCreateForm = false;
        await this.loadEvents();
      } catch (err) {
        Alpine.store('notify').error('Error al crear evento: ' + err.message);
      } finally {
        this.saving = false;
      }
    },

    navigateToEvent(slug) {
      window.location.hash = `#/events/${slug}`;
    }
  }));

  // Event Dashboard Component (from pages/event-dashboard.js)
  Alpine.data('eventDashboard', () => ({
    event: null,
    stats: { totalSold: 0, totalRevenue: 0, donations: 0, scanned: 0, unscanned: 0 },
    typeBreakdown: [],
    loading: true,
    eventId: null,
    eventSlug: null,

    // Edit event modal
    showEditEvent: false,
    editForm: {},

    // Ticket type form
    showTypeForm: false,
    typeForm: { name: '', type: 'general', price: '' },
    savingType: false,

    async init() {
      this.eventSlug = this.getEventSlugFromHash();
      if (!this.eventSlug) { window.location.hash = '#/events'; return; }
      await this.loadAll();
    },

    getEventSlugFromHash() {
      const match = window.location.hash.match(/#\/events\/([a-zA-Z0-9-]+)$/);
      return match ? match[1] : null;
    },

    async loadAll() {
      this.loading = true;
      try {
        await Promise.all([
          this.loadEvent(),
          this.loadStats(),
          this.loadTicketTypes()
        ]);
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      } finally {
        this.loading = false;
      }
    },

    async loadEvent() {
      const { data, error } = await db
        .from('events').select('*').eq('slug', this.eventSlug).single();
      if (error) throw error;
      this.event = data;
      this.eventId = data.id; // Keep UUID for other queries
    },

    async loadTicketTypes() {
      const { data, error } = await db
        .from('ticket_types').select('*').eq('event_id', this.eventId).order('sort_order');
      if (error) throw error;
      this.ticketTypes = data || [];
    },

    async loadStats() {
      // Orders for this event
      const { data: orders } = await db
        .from('orders').select('id, total_cents, status')
        .eq('event_id', this.eventId).eq('status', 'confirmed');

      // Order items with types
      const orderIds = (orders || []).map(o => o.id);
      let orderItems = [];
      if (orderIds.length > 0) {
        const { data } = await db
          .from('order_items').select('*, ticket_types(name, type, takes_seat)')
          .in('order_id', orderIds);
        orderItems = data || [];
      }

      // Tickets (scan stats)
      const { data: tickets } = await db
        .from('tickets').select('scanned').eq('event_id', this.eventId);

      // Calculate stats
      const allTickets = tickets || [];
      this.stats.scanned = allTickets.filter(t => t.scanned).length;
      this.stats.unscanned = allTickets.filter(t => !t.scanned).length;
      this.stats.totalRevenue = (orders || []).reduce((sum, o) => sum + o.total_cents, 0);

      // Breakdown by ticket type
      const breakdown = {};
      for (const item of orderItems) {
        const typeName = item.ticket_types?.name || 'Desconocido';
        const isDonation = item.ticket_types?.type === 'donation' || item.ticket_types?.type === 'donation_custom';
        if (!breakdown[typeName]) {
          breakdown[typeName] = { name: typeName, quantity: 0, revenue: 0, isDonation };
        }
        breakdown[typeName].quantity += item.quantity;
        breakdown[typeName].revenue += item.subtotal_cents;
      }

      this.typeBreakdown = Object.values(breakdown);
      // totalSold should be number of orders (invoices), not individual tickets
      this.stats.totalSold = orders ? orders.length : 0;
      this.stats.donations = this.typeBreakdown.filter(b => b.isDonation).reduce((s, b) => s + b.revenue, 0);
    },

    formatCents(cents) {
      return (cents / 100).toFixed(2).replace('.', ',') + ' €';
    },

    formatDate(dateStr) {
      if (!dateStr) return '—';
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    },

    formatDateInput(dateStr) {
      if (!dateStr) return '';
      return new Date(dateStr).toISOString().slice(0, 16);
    },

    // --- Edit Event ---
    openEditEvent() {
      this.editForm = {
        name: this.event.name,
        slug: this.event.slug,
        description: this.event.description || '',
        venue: this.event.venue,
        event_date: this.formatDateInput(this.event.event_date),
        duration_minutes: this.event.duration_minutes,
        total_seats: this.event.total_seats,
        open_time: this.formatDateInput(this.event.open_time),
        sales_cutoff: this.formatDateInput(this.event.sales_cutoff),
        image_url: this.event.image_url || '',
      };
      this.showEditEvent = true;
    },

    async saveEvent() {
      if (!this.editForm.name || !this.editForm.slug) {
        Alpine.store('notify').error('Nombre y slug son obligatorios');
        return;
      }

      this.savingEvent = true;
      try {
        const seatDiff = parseInt(this.editForm.total_seats) - this.event.total_seats;
        const newAvailable = Math.max(0, this.event.available_seats + seatDiff);

        const { error } = await db.from('events').update({
          name: this.editForm.name,
          slug: this.editForm.slug,
          description: this.editForm.description,
          venue: this.editForm.venue,
          event_date: new Date(this.editForm.event_date).toISOString(),
          duration_minutes: parseInt(this.editForm.duration_minutes),
          total_seats: parseInt(this.editForm.total_seats),
          available_seats: newAvailable,
          open_time: new Date(this.editForm.open_time).toISOString(),
          sales_cutoff: new Date(this.editForm.sales_cutoff).toISOString(),
          image_url: this.editForm.image_url || null,
        }).eq('id', this.eventId);

        if (error) throw error;
        Alpine.store('notify').success('Evento actualizado');
        this.showEditEvent = false;
        await this.loadEvent();
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      } finally {
        this.savingEvent = false;
      }
    },

    // --- Add Ticket Type ---
    openAddType() {
      this.typeForm = {
        name: '', type: 'general', price: '', quantity: 1,
        takes_seat: true, enabled: true, legal_text: '', fiscal_text: '',
      };
      this.showAddType = true;
    },

    onTypeChange() {
      const t = this.typeForm.type;
      this.typeForm.takes_seat = (t === 'general' || t === 'group');
      if (t === 'general' || t === 'donation' || t === 'donation_custom') {
        this.typeForm.quantity = 1;
      }
    },

    async saveTicketType() {
      if (!this.typeForm.name || !this.typeForm.price) {
        Alpine.store('notify').error('Nombre y precio son obligatorios');
        return;
      }
      this.savingType = true;
      try {
        const priceCents = Math.round(parseFloat(this.typeForm.price) * 100);
        const { error } = await db.from('ticket_types').insert({
          event_id: this.eventId,
          name: this.typeForm.name,
          type: this.typeForm.type,
          price_cents: priceCents,
          quantity: parseInt(this.typeForm.quantity),
          takes_seat: this.typeForm.takes_seat,
          enabled: this.typeForm.enabled,
          legal_text: this.typeForm.legal_text || null,
          fiscal_text: this.typeForm.fiscal_text || null,
          sort_order: this.ticketTypes.length,
        });
        if (error) throw error;
        Alpine.store('notify').success('Tipo de entrada añadido');
        this.showAddType = false;
        await this.loadTicketTypes();
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      } finally {
        this.savingType = false;
      }
    },

    async deleteTicketType(id) {
      if (!confirm('¿Eliminar este tipo de entrada?')) return;
      try {
        const { error } = await db.from('ticket_types').delete().eq('id', id);
        if (error) throw error;
        Alpine.store('notify').success('Tipo de entrada eliminado');
        await this.loadTicketTypes();
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      }
    },

    async toggleTicketType(id, enabled) {
      try {
        const { error } = await db.from('ticket_types').update({ enabled: !enabled }).eq('id', id);
        if (error) throw error;
        await this.loadTicketTypes();
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      }
    },

    navigateToOrders() {
      window.location.hash = `#/events/${this.eventSlug}/orders`;
    },

    navigateToTickets() {
      window.location.hash = `#/events/${this.eventSlug}/tickets`;
    },

    navigateToScan() {
      window.location.hash = `#/scan?event=${this.eventSlug}`;
    }
  }));

  // Orders Page Component (from pages/orders.js)
  Alpine.data('ordersPage', () => ({
    orders: [],
    event: null,
    loading: true,
    eventId: null,
    eventSlug: null,
    filter: 'all', // 'all' | 'sent' | 'failed' | 'pending'

    async init() {
      this.eventSlug = this.getEventSlugFromHash();
      if (!this.eventSlug) { window.location.hash = '#/events'; return; }
      await this.loadData();
    },

    getEventSlugFromHash() {
      const match = window.location.hash.match(/#\/events\/([a-zA-Z0-9-]+)\/orders/);
      return match ? match[1] : null;
    },

    async loadData() {
      this.loading = true;
      try {
        const { data: event } = await db
          .from('events').select('id, name, slug').eq('slug', this.eventSlug).single();
        this.event = event;
        this.eventId = event.id;

        const { data: orders, error } = await db
          .from('orders').select('*')
          .eq('event_id', this.eventId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        this.orders = orders || [];
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      } finally {
        this.loading = false;
      }
    },

    get filteredOrders() {
      if (this.filter === 'all') return this.orders;
      return this.orders.filter(o => o.email_status === this.filter);
    },

    get emailCounts() {
      const counts = { all: this.orders.length, sent: 0, failed: 0, pending: 0 };
      for (const o of this.orders) {
        if (counts[o.email_status] !== undefined) counts[o.email_status]++;
      }
      return counts;
    },

    formatCents(cents) {
      return (cents / 100).toFixed(2).replace('.', ',') + ' €';
    },

    formatDate(dateStr) {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    },

    emailStatusClass(status) {
      switch (status) {
        case 'sent': return 'badge--success';
        case 'failed': return 'badge--danger';
        case 'pending': return 'badge--warning';
        default: return 'badge--muted';
      }
    },

    emailStatusLabel(status) {
      switch (status) {
        case 'sent': return 'Enviado';
        case 'failed': return 'Error';
        case 'pending': return 'Pendiente';
        default: return status;
      }
    },

    navigateToOrder(orderId) {
      window.location.hash = `#/events/${this.eventId}/orders/${orderId}`;
    },

    navigateBack() {
      window.location.hash = `#/events/${this.eventId}`;
    }
  }));

  // Order Detail Component (from pages/order-detail.js)
  Alpine.data('orderDetailPage', () => ({
    order: null,
    event: null,
    loading: true,
    resending: false,
    eventId: null,
    eventSlug: null,
    orderId: null,

    async init() {
      const match = window.location.hash.match(/#\/events\/([a-zA-Z0-9-]+)\/orders\/([a-f0-9-]+)/);
      if (!match) { window.location.hash = '#/events'; return; }
      this.eventSlug = match[1];
      this.orderId = match[2];
      await this.loadData();
    },

    async loadData() {
      this.loading = true;
      try {
        const [orderRes, ticketRes, eventRes] = await Promise.all([
          db.from('orders').select('*').eq('id', this.orderId).single(),
          db.from('tickets').select('*').eq('order_id', this.orderId)
            .order('created_at'),
          db.from('events').select('id, name, slug').eq('slug', this.eventSlug).single(),
        ]);

        if (orderRes.error) throw orderRes.error;
        if (ticketRes.error) throw ticketRes.error;
        if (eventRes.error) throw eventRes.error;

        this.order = orderRes.data;
        this.event = eventRes.data;
        this.eventId = eventRes.data.id;
        this.tickets = ticketRes.data || [];
      } catch (err) {
        Alpine.store('notify').error('Error: ' + err.message);
      } finally {
        this.loading = false;
      }
    },

    async resendTickets() {
      if (!confirm('¿Reenviar las entradas por email a ' + this.order.buyer_email + '?')) return;
      this.resending = true;
      try {
        await callEdgeFunction('resend-tickets', { orderId: this.orderId });
        Alpine.store('notify').success('Entradas reenviadas correctamente');
        await this.loadData(); // refresh email status
      } catch (err) {
        Alpine.store('notify').error('Error al reenviar: ' + err.message);
      } finally {
        this.resending = false;
      }
    },

    formatCents(cents) {
      return (cents / 100).toFixed(2).replace('.', ',') + ' €';
    },

    formatDate(dateStr) {
      if (!dateStr) return '—';
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    },

    emailStatusClass(status) {
      switch (status) {
        case 'sent': return 'badge--success';
        case 'failed': return 'badge--danger';
        case 'pending': return 'badge--warning';
        default: return 'badge--muted';
      }
    },

    emailStatusLabel(status) {
      switch (status) {
        case 'sent': return 'Enviado';
        case 'failed': return 'Error';
        case 'pending': return 'Pendiente';
        default: return status;
      }
    },

    ticketStatusLabel(ticket) {
      return ticket.scanned ? 'Escaneado' : 'No escaneado';
    },

    ticketStatusClass(ticket) {
      return ticket.scanned ? 'badge--success' : 'badge--muted';
    },

    navigateBack() {
      window.location.hash = `#/events/${this.eventSlug}/orders`;
    }
  }));

  // Scanner Page Component (from pages/scanner.js)
  Alpine.data('scannerPage', () => ({
    events: [],
    selectedEventId: null,
    selectedEventSlug: null,
    scanner: null,
    scanning: false,
    loading: true,

    // Enhanced scanner state
    scannerStatus: null,        // 'initializing', 'active', 'error', null
    scannerMessage: '',        // User-friendly status message
    scannerDebug: null,        // Debug information

    // Scan result state
    result: null,       // { status, message, ticket }
    resultVisible: false,
    processing: false,
    cooldown: false,

    // Stats for selected event
    scanned: 0,
    total: 0,

    async init() {
      await this.loadEvents();

      // Check if event was passed via query param
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const eventParam = params.get('event');
      if (eventParam && this.events.find(e => e.slug === eventParam)) {
        this.selectedEventSlug = eventParam;
        const event = this.events.find(e => e.slug === eventParam);
        this.selectedEventId = event.id;
        await this.loadScanStats();
      }
    },

    async loadEvents() {
      this.loading = true;
      try {
        const now = new Date().toISOString();
        const { data } = await db
          .from('events').select('id, slug, name, event_date, open_time')
          .order('event_date', { ascending: true });
        this.events = data || [];
      } catch (err) {
        Alpine.store('notify').error('Error al cargar eventos');
      } finally {
        this.loading = false;
      }
    },

    async loadScanStats() {
      if (!this.selectedEventId) return;
      const { data } = await db
        .from('tickets').select('scanned').eq('event_id', this.selectedEventId);
      const all = data || [];
      this.total = all.length;
      this.scanned = all.filter(t => t.scanned).length;
    },

    async onEventSelect() {
      await this.stopScanning();
      this.result = null;
      this.resultVisible = false;
      if (this.selectedEventId) {
        const event = this.events.find(e => e.id === this.selectedEventId);
        this.selectedEventSlug = event ? event.slug : null;
        await this.loadScanStats();
      } else {
        this.selectedEventSlug = null;
      }
    },

    // Handle scanner status changes
    onScannerStatusChange(status, message) {
      this.scannerStatus = status;
      this.scannerMessage = message;
      
      if (this.scanner) {
        this.scannerDebug = this.scanner.getStatus();
        console.log('📷 Scanner status:', status, message, this.scannerDebug);
      }
    },

    async startScanning() {
      if (!this.selectedEventId) {
        Alpine.store('notify').error('Selecciona un evento primero');
        return;
      }
      
      this.result = null;
      this.resultVisible = false;
      this.scannerStatus = null;
      this.scannerMessage = '';
      this.scannerDebug = null;

      this.scanner = new QRScanner('qr-reader');
      try {
        await this.scanner.start(
          (text) => this.onScan(text),
          (status, message) => this.onScannerStatusChange(status, message)
        );
        this.scanning = true;
      } catch (err) {
        console.error('❌ Scanner failed to start:', err);
        // Error message is already handled by the scanner's onStatusChange
        this.scanning = false;
      }
    },

    async stopScanning() {
      if (this.scanner) {
        console.log('🛑 Stopping scanner...');
        await this.scanner.dispose();
        this.scanner = null;
      }
      this.scanning = false;
      this.scannerStatus = null;
      this.scannerMessage = '';
      this.scannerDebug = null;
    },

    async onScan(ticketToken) {
      if (this.processing || this.cooldown) return;
      this.processing = true;
      this.resultVisible = false;

      // Add haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(200);
      }

      try {
        console.log('🎫 Validating ticket:', ticketToken);
        const data = await callEdgeFunction('validate-ticket', { ticketToken });
        this.result = data;
        this.resultVisible = true;

        // Play success sound (optional - you can add audio element)
        this.playScanSound(data.status);

        if (data.status === 'ok') {
          await this.loadScanStats();
        }
      } catch (err) {
        console.error('❌ Ticket validation failed:', err);
        this.result = { status: 'error', message: err.message };
        this.resultVisible = true;
        this.playScanSound('error');
      } finally {
        this.processing = false;
        // Cooldown to prevent rapid duplicate reads
        this.cooldown = true;
        setTimeout(() => { this.cooldown = false; }, 2000);
      }
    },

    playScanSound(status) {
      // You can add audio feedback here if desired
      // For now, just log it
      console.log('🔊 Scan sound:', status);
    },

    resultClass() {
      if (!this.result) return '';
      switch (this.result.status) {
        case 'ok': return 'scan-result--ok';
        case 'already_used': return 'scan-result--warn';
        default: return 'scan-result--error';
      }
    },

    resultIcon() {
      if (!this.result) return '';
      return this.result.status === 'ok' ? '✓' : '✕';
    },

    // Get scanner status class for styling
    scannerStatusClass() {
      switch (this.scannerStatus) {
        case 'initializing': return 'scanner-status--initializing';
        case 'active': return 'scanner-status--active';
        case 'error': return 'scanner-status--error';
        default: return '';
      }
    },

    destroy() {
      this.stopScanning();
    }
  }));

  // Tickets Page Component
  Alpine.data('ticketsPage', () => ({
    event: null,
    tickets: [],
    loading: true,
    eventId: null,
    eventSlug: null,
    
    // Search and filter
    searchQuery: '',
    statusFilter: 'all',
    
    // Pagination
    currentPage: 1,
    pageSize: 50,
    
    // Computed properties
    get totalTickets() {
      return this.tickets.length;
    },
    
    get scannedCount() {
      return this.tickets.filter(t => t.scanned).length;
    },
    
    get unscannedCount() {
      return this.tickets.filter(t => !t.scanned).length;
    },
    
    get filteredTickets() {
      let filtered = this.tickets;
      
      // Apply status filter
      if (this.statusFilter === 'scanned') {
        filtered = filtered.filter(t => t.scanned);
      } else if (this.statusFilter === 'unscanned') {
        filtered = filtered.filter(t => !t.scanned);
      }
      
      // Apply search filter
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase();
        filtered = filtered.filter(ticket => 
          (ticket.ticket_token && ticket.ticket_token.toLowerCase().includes(query)) ||
          (ticket.buyer_name && ticket.buyer_name.toLowerCase().includes(query)) ||
          (ticket.buyer_email && ticket.buyer_email.toLowerCase().includes(query)) ||
          (ticket.ticket_type_name && ticket.ticket_type_name.toLowerCase().includes(query))
        );
      }
      
      return filtered;
    },
    
    get totalPages() {
      return Math.ceil(this.filteredTickets.length / this.pageSize);
    },
    
    get paginatedTickets() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      return this.filteredTickets.slice(start, end);
    },
    
    get visiblePages() {
      const pages = [];
      const totalPages = this.totalPages;
      const current = this.currentPage;
      
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        if (current <= 4) {
          for (let i = 1; i <= 5; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        } else if (current >= totalPages - 3) {
          pages.push(1);
          pages.push('...');
          for (let i = totalPages - 4; i <= totalPages; i++) {
            pages.push(i);
          }
        } else {
          pages.push(1);
          pages.push('...');
          for (let i = current - 1; i <= current + 1; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        }
      }
      
      return pages;
    },
    
    async init() {
      // Parse event ID from URL
      const match = window.location.hash.match(/#\/events\/([a-zA-Z0-9-]+)\/tickets/);
      if (match) {
        this.eventSlug = match[1];
        await this.loadData();
      } else {
        Alpine.store('notify').error('ID de evento no encontrado');
        this.navigateBack();
      }
    },
    
    async loadData() {
      this.loading = true;
      try {
        // Load event details
        const { data: event } = await db
          .from('events')
          .select('id, name, slug, event_date, venue')
          .eq('slug', this.eventSlug)
          .single();
        
        if (!event) throw new Error('Evento no encontrado');
        this.event = event;
        this.eventId = event.id;
        
        // Load tickets with order and ticket type info
        const { data: tickets } = await db
          .from('tickets')
          .select(`
            *,
            orders!inner(
              buyer_name,
              buyer_email
            ),
            order_items!inner(
              ticket_types!inner(
                name
              )
            )
          `)
          .eq('event_id', this.eventId)
          .order('created_at', { ascending: false });
        
        this.tickets = tickets || [];
        console.log(`🎫 Loaded ${this.tickets.length} tickets for event ${this.eventSlug}`);
        
      } catch (err) {
        console.error('❌ Error loading tickets:', err);
        Alpine.store('notify').error('Error al cargar entradas: ' + err.message);
      } finally {
        this.loading = false;
      }
    },
    
    onSearchChange() {
      this.currentPage = 1; // Reset to first page when searching
    },
    
    onFilterChange() {
      this.currentPage = 1; // Reset to first page when filtering
    },
    
    goToPage(page) {
      if (page >= 1 && page <= this.totalPages && page !== '...') {
        this.currentPage = page;
      }
    },
    
    navigateBack() {
      window.location.hash = `#/events/${this.eventSlug}`;
    },
    
    formatDate(dateStr) {
      if (!dateStr) return '—';
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
  }));

});
