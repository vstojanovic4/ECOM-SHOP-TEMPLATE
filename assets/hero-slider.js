if (!customElements.get('hero-slider')) {
  class HeroSlider extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-track]');
      this.slides = Array.from(this.querySelectorAll('[data-slide]'));
      if (!this.track || this.slides.length < 2) return;

      this.pills = Array.from(this.querySelectorAll('[data-pill]'));
      this.index = 0;
      this.targetIndex = null;
      this.pauseReasons = new Set();
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.autoplay = this.dataset.autoplay === 'true';

      this.abort = new AbortController();
      const options = { signal: this.abort.signal };

      this.querySelector('[data-prev]')?.addEventListener('click', () => this.go(this.index - 1), options);
      this.querySelector('[data-next]')?.addEventListener('click', () => this.go(this.index + 1), options);
      this.pills.forEach((pill, i) => pill.addEventListener('click', () => this.go(i), options));
      this.addEventListener('keydown', (event) => this.onKeydown(event), options);
      this.setupDrag(options);

      // Aktivni slajd pratimo preko IntersectionObserver-a (radi i za swipe)
      this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
        root: this.track,
        threshold: 0.6,
      });
      this.slides.forEach((slide) => this.observer.observe(slide));

      if (this.autoplay) this.setupAutoplay(options);

      // Theme editor: izabran blok -> idi na taj slajd i pauziraj
      document.addEventListener('shopify:block:select', (event) => {
        if (event.detail.sectionId !== this.dataset.sectionId) return;
        const i = this.slides.indexOf(event.target);
        if (i === -1) return;
        this.pause('editor');
        this.go(i, 'auto');
      }, options);
      document.addEventListener('shopify:block:deselect', (event) => {
        if (event.detail.sectionId !== this.dataset.sectionId) return;
        this.resume('editor');
      }, options);

      this.setActive(0);
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.observer?.disconnect();
      clearTimeout(this.targetTimer);
      clearTimeout(this.snapTimer);
    }

    // Prevlacenje misem (touch vec radi preko scroll-snap-a)
    setupDrag(options) {
      const threshold = 50;
      let startX = 0;
      let startScroll = 0;
      let pointerId = null;
      let moved = false;
      let startIndex = 0;

      this.track.addEventListener('dragstart', (event) => event.preventDefault(), options);

      this.track.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startScroll = this.track.scrollLeft;
        startIndex = this.index;
        moved = false;
      }, options);

      this.track.addEventListener('pointermove', (event) => {
        if (event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;

        if (!moved) {
          if (Math.abs(dx) < 5) return;
          moved = true;
          clearTimeout(this.snapTimer);
          this.track.classList.add('is-dragging');
          this.track.setPointerCapture(pointerId);
          this.pause('drag');
          this.dragging = true;
        }
        this.track.scrollLeft = startScroll - dx;
      }, options);

      const end = (event) => {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        this.dragging = false;
        if (!moved) return;

        const dx = event.clientX - startX;
        let target = startIndex;
        if (dx <= -threshold) target = startIndex + 1;
        if (dx >= threshold) target = startIndex - 1;

        this.go(target);
        this.resume('drag');
        // Snap ukljucujemo tek kad se skrol zavrsi, da ne "skoci"
        this.snapTimer = setTimeout(() => this.track.classList.remove('is-dragging'), 700);
      };
      this.track.addEventListener('pointerup', end, options);
      this.track.addEventListener('pointercancel', end, options);

      // Posle prevlacenja klik ne otvara link
      this.track.addEventListener('click', (event) => {
        if (!moved) return;
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }, { capture: true, signal: options.signal });
    }

    setupAutoplay(options) {
      this.classList.add('is-autoplay');
      if (this.reducedMotion.matches) this.pauseReasons.add('motion');

      this.addEventListener('mouseenter', () => this.pause('hover'), options);
      this.addEventListener('mouseleave', () => this.resume('hover'), options);

      // Pauza samo na fokus sa tastature (ne na klik misem)
      this.addEventListener('focusin', (event) => {
        if (event.target.matches(':focus-visible')) this.pause('focus');
      }, options);
      this.addEventListener('focusout', (event) => {
        if (!this.contains(event.relatedTarget)) this.resume('focus');
      }, options);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.pause('hidden');
        else this.resume('hidden');
      }, options);

      this.reducedMotion.addEventListener('change', () => {
        if (this.reducedMotion.matches) this.pause('motion');
        else this.resume('motion');
      }, options);

      // Kraj animacije punjenja pilule = sledeci slajd
      this.addEventListener('animationend', (event) => {
        if (event.animationName === 'hero-slider-progress') this.go(this.index + 1);
      }, options);

      this.updatePlayback();
    }

    pause(reason) {
      this.pauseReasons.add(reason);
      this.updatePlayback();
    }

    resume(reason) {
      this.pauseReasons.delete(reason);
      this.updatePlayback();
    }

    updatePlayback() {
      if (!this.autoplay) return;
      const paused = this.pauseReasons.size > 0;
      this.classList.toggle('is-paused', paused);
      // Dok se slajdovi sami menjaju, citac ekrana ne najavljuje svaku promenu
      this.track.setAttribute('aria-live', paused ? 'polite' : 'off');
    }

    go(i, behavior = 'smooth') {
      const count = this.slides.length;
      const next = ((i % count) + count) % count;
      const changed = next !== this.index;
      const hadFocus = changed && this.slides[this.index].contains(document.activeElement);

      // Dok traje skrol, observer ignorise slajdove "usput"
      this.targetIndex = next;
      clearTimeout(this.targetTimer);
      this.targetTimer = setTimeout(() => (this.targetIndex = null), 1000);

      this.track.scrollTo({
        left: this.slides[next].offsetLeft,
        behavior: this.reducedMotion.matches ? 'auto' : behavior,
      });
      if (changed) this.setActive(next);

      if (hadFocus) this.slides[next].focus({ preventScroll: true });
    }

    onIntersect(entries) {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || this.dragging) return;
        const i = this.slides.indexOf(entry.target);

        if (this.targetIndex !== null) {
          if (i === this.targetIndex) this.targetIndex = null;
          return;
        }
        if (i !== this.index) this.setActive(i);
      });
    }

    setActive(i) {
      this.index = i;

      this.slides.forEach((slide, j) => {
        slide.inert = j !== i;
      });

      this.pills.forEach((pill, j) => {
        if (j === i) pill.setAttribute('aria-current', 'true');
        else pill.removeAttribute('aria-current');
      });
    }

    onKeydown(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.target.closest('input, textarea, select')) return;
      event.preventDefault();
      this.go(event.key === 'ArrowLeft' ? this.index - 1 : this.index + 1);
    }
  }

  customElements.define('hero-slider', HeroSlider);
}
