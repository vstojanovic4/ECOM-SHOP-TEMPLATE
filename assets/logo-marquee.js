if (!customElements.get('logo-marquee')) {
  class LogoMarquee extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-track]');
      this.list = this.querySelector('[data-list]');
      if (!this.track || !this.list) return;

      this.speed = Number(this.dataset.speed) || 50;
      // 1 = s desna na levo, -1 = s leva na desno
      this.direction = this.dataset.direction === 'right' ? -1 : 1;
      this.pos = 0;
      this.setWidth = 0;
      this.visible = true;
      this.dragging = false;
      this.lastTime = null;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.abort = new AbortController();
      const options = { signal: this.abort.signal };

      // Kad se ucitaju slike ili promeni sirina ekrana, preracunaj
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(this.list);
      this.resizeObserver.observe(this);

      // Ne animiraj dok traka nije na ekranu
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
      });
      this.intersectionObserver.observe(this);

      this.setupDrag(options);
      this.measure();

      this.tick = this.tick.bind(this);
      this.frame = requestAnimationFrame(this.tick);
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.resizeObserver?.disconnect();
      this.intersectionObserver?.disconnect();
      cancelAnimationFrame(this.frame);
    }

    // Kopiramo listu logoa koliko puta treba da traka uvek bude puna
    measure() {
      const width = this.list.offsetWidth;
      if (!width) return;
      this.setWidth = width;

      const needed = Math.ceil(this.offsetWidth / width) + 1;
      const clones = this.track.querySelectorAll('[data-clone]');

      if (clones.length !== needed) {
        clones.forEach((clone) => clone.remove());
        for (let i = 0; i < needed; i++) {
          const clone = this.list.cloneNode(true);
          clone.removeAttribute('data-list');
          clone.setAttribute('data-clone', '');
          clone.setAttribute('aria-hidden', 'true');
          clone.querySelectorAll('[data-shopify-editor-block]').forEach((item) => {
            item.removeAttribute('data-shopify-editor-block');
          });
          this.track.appendChild(clone);
        }
      }

      this.render();
    }

    tick(time) {
      const canMove = !this.dragging && this.visible && !this.reducedMotion.matches && this.setWidth;

      if (this.lastTime !== null && canMove) {
        // Max 100ms po frejmu, da ne "skoci" posle vracanja na tab
        const delta = Math.min(time - this.lastTime, 100) / 1000;
        this.pos += this.speed * this.direction * delta;
        this.render();
      }

      this.lastTime = time;
      this.frame = requestAnimationFrame(this.tick);
    }

    render() {
      if (!this.setWidth) return;
      const width = this.setWidth;
      this.pos = ((this.pos % width) + width) % width;
      this.track.style.setProperty('--lm-x', `${-this.pos}px`);
    }

    // Prevlacenje misem i prstom
    setupDrag(options) {
      let pointerId = null;
      let startX = 0;
      let startPos = 0;

      this.track.addEventListener('dragstart', (event) => event.preventDefault(), options);

      this.track.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startPos = this.pos;
        this.dragging = true;
        this.track.setPointerCapture(pointerId);
        this.track.classList.add('is-dragging');
      }, options);

      this.track.addEventListener('pointermove', (event) => {
        if (event.pointerId !== pointerId) return;
        this.pos = startPos - (event.clientX - startX);
        this.render();
      }, options);

      const end = (event) => {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        this.dragging = false;
        this.track.classList.remove('is-dragging');
      };
      this.track.addEventListener('pointerup', end, options);
      this.track.addEventListener('pointercancel', end, options);
    }
  }

  customElements.define('logo-marquee', LogoMarquee);
}
