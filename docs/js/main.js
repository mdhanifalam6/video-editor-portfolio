/* =========================================================
   Md Hanif Alam — Portfolio front-end
   Reads everything from data/portfolio.json (edited via /admin)
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const startTime = performance.now();

  let DATA = null;
  let visibleWorks = [];

  /* ---------------- boot ---------------- */
  init();

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    setupHeader();
    setupScrollProgress();
    setupCursor();
    setupParallax();
    setupLightbox();
    setupContactForm();

    try {
      const res = await fetch('data/portfolio.json?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      DATA = await res.json();
      render(DATA);
    } catch (err) {
      console.error(err);
      $('#workGrid').innerHTML = '<p class="work-empty">Could not load portfolio data. Open the site through the server (node server.js) or a web host — not by double-clicking the file.</p>';
    }

    splitHeroTitle();
    setupReveal();
    setupMagnetic();
    finishLoading();
  }

  function finishLoading() {
    const wait = reduceMotion ? 0 : Math.max(0, 1100 - (performance.now() - startTime));
    setTimeout(() => {
      document.body.classList.add('loaded');
      document.body.classList.remove('is-loading');
    }, wait);
  }

  /* ---------------- render everything from data ---------------- */
  function render(d) {
    const p = d.profile || {};
    $$('[data-bind]').forEach(el => {
      const v = get(d, el.dataset.bind);
      if (v != null && v !== '') el.textContent = v;
    });
    document.title = `${p.name || 'Portfolio'} — ${p.role || ''}`.trim();

    // experience badge text
    const yrs = p.yearsExperience || 8;
    $('#badgeText').textContent = `${yrs}+ YEARS OF EXPERIENCE • VIDEO EDITOR • `;

    renderPhoto(p);
    renderWorks(d.works || []);
    renderAbout(p, d.services || []);
    renderSkills(d.software || []);
    renderTimeline(d.experience || []);
    renderContactLinks(p);

    $('#statProjects').textContent = (d.works || []).length;
    $('#statTools').textContent = (d.software || []).length;
    $$('[data-count-bind]').forEach(el => { el.textContent = get(d, el.dataset.countBind) ?? el.textContent; });
  }

  function monogramSVG(name) {
    const initials = (name || 'M H').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'MH';
    return `<div class="monogram"><svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(234,247,245,.18)" stroke-width="1.5" stroke-dasharray="4 7"/>
      <text x="100" y="122" text-anchor="middle" font-family="Syne, sans-serif" font-weight="800" font-size="68" fill="#eef7f5">${esc(initials)}</text>
      <circle cx="152" cy="58" r="9" fill="#ff7a1f"/><circle cx="48" cy="150" r="6" fill="#19c3b1"/>
    </svg></div>`;
  }

  function renderPhoto(p) {
    const html = p.photo
      ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="eager">`
      : monogramSVG(p.name);
    $('#heroPhoto').innerHTML = html;
    $('#aboutPhoto').innerHTML = p.photo
      ? `<img src="${esc(p.photo)}" alt="${esc(p.name)} portrait" loading="lazy">`
      : monogramSVG(p.name);
  }

  /* ---------------- works ---------------- */
  function renderWorks(works) {
    const grid = $('#workGrid');
    const filters = $('#filters');
    $('#workEmpty').hidden = works.length > 0;

    const cats = [...new Set(works.map(w => w.category).filter(Boolean))];
    filters.innerHTML = ['All', ...cats].map((c, i) => {
      const n = c === 'All' ? works.length : works.filter(w => w.category === c).length;
      return `<button class="filter${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0}" data-filter="${esc(c)}">${esc(c)}<sup>${n}</sup></button>`;
    }).join('');
    filters.hidden = cats.length < 2;

    grid.innerHTML = works.map((w, i) => `
      <article class="work-card ${w.orientation === 'portrait' ? 'portrait' : 'landscape'}" data-id="${esc(w.id)}" data-cat="${esc(w.category)}" style="--d:${(i % 4) * 0.08}s">
        <div class="work-inner">
          <button class="work-media" data-open="${esc(w.id)}" aria-label="Play ${esc(w.title)}">
            ${w.poster ? `<img src="${esc(w.poster)}" alt="" loading="lazy" decoding="async">` : ''}
            <video muted loop playsinline preload="none" data-src="${esc(w.preview || w.video)}"></video>
            <span class="work-badge">${esc(w.category || 'Project')}</span>
            <span class="work-sound mono">Preview · click for sound</span>
            <span class="work-play" aria-hidden="true"></span>
            <span class="work-progress"><i></i></span>
          </button>
          <div class="work-info">
            <div class="work-meta"><span>${esc(w.category || '')}</span>${w.year ? `<span>${esc(w.year)}</span>` : ''}</div>
            <h3>${esc(w.title)}</h3>
            ${w.description ? `<p>${esc(w.description)}</p>` : ''}
          </div>
        </div>
      </article>`).join('');

    visibleWorks = works.slice();

    filters.addEventListener('click', e => {
      const btn = e.target.closest('.filter');
      if (!btn) return;
      $$('.filter', filters).forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn); });
      const f = btn.dataset.filter;
      $$('.work-card', grid).forEach(card => {
        const show = f === 'All' || card.dataset.cat === f;
        card.classList.toggle('is-hidden', !show);
        if (show) { card.classList.remove('in'); requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in'))); }
      });
      visibleWorks = works.filter(w => f === 'All' || w.category === f);
      layoutGrid();
    });

    grid.addEventListener('click', e => {
      const btn = e.target.closest('[data-open]');
      if (btn) openLightbox(btn.dataset.open);
    });

    setupHoverPlay(grid);
    layoutGrid();
    new ResizeObserver(() => layoutGrid()).observe(grid);
    if (document.fonts) document.fonts.ready.then(layoutGrid);
  }

  // masonry: each card spans as many 8px rows as its height needs
  function layoutGrid() {
    const grid = $('#workGrid');
    if (!grid) return;
    const w = grid.clientWidth;
    const cols = w >= 1060 ? 4 : w >= 720 ? 3 : w >= 440 ? 2 : 1;
    grid.style.setProperty('--cols', cols);
    grid.classList.toggle('cols-1', cols === 1);
    $$('.work-card', grid).forEach(card => {
      if (card.classList.contains('is-hidden')) return;
      const h = card.firstElementChild.getBoundingClientRect().height;
      card.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil(h / 8));
    });
  }

  function setupHoverPlay(grid) {
    const start = card => {
      const v = $('video', card);
      if (!v) return;
      if (!v.src) { v.src = v.dataset.src; }
      v.currentTime = 0;
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
      card.classList.add('playing');
      tickProgress(card, v);
    };
    const stop = card => {
      const v = $('video', card);
      card.classList.remove('playing');
      if (v) { v.pause(); }
      const bar = $('.work-progress i', card); if (bar) bar.style.transform = 'scaleX(0)';
    };

    if (finePointer) {
      grid.addEventListener('mouseover', e => {
        const card = e.target.closest('.work-card');
        if (card && !card.contains(e.relatedTarget)) start(card);
      });
      grid.addEventListener('mouseout', e => {
        const card = e.target.closest('.work-card');
        if (card && !card.contains(e.relatedTarget)) stop(card);
      });
      grid.addEventListener('focusin', e => { const c = e.target.closest('.work-card'); if (c) start(c); });
      grid.addEventListener('focusout', e => { const c = e.target.closest('.work-card'); if (c) stop(c); });
    } else if ('IntersectionObserver' in window) {
      // touch screens: play the preview of the card that is centered on screen
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => en.isIntersecting ? start(en.target) : stop(en.target));
      }, { threshold: 0.75 });
      $$('.work-card', grid).forEach(c => io.observe(c));
    }
  }

  function tickProgress(card, v) {
    const bar = $('.work-progress i', card);
    const step = () => {
      if (!card.classList.contains('playing')) return;
      if (v.duration) bar.style.transform = `scaleX(${v.currentTime / v.duration})`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- lightbox ---------------- */
  let lbIndex = 0;
  function setupLightbox() {
    const lb = $('#lightbox');
    lb.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) closeLightbox();
      if (e.target.closest('[data-prev]')) stepLightbox(-1);
      if (e.target.closest('[data-next]')) stepLightbox(1);
    });
    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });
    $$('[data-open-showreel]').forEach(b => b.addEventListener('click', () => {
      if (!DATA) return;
      const id = DATA.profile?.showreelWorkId;
      const work = (DATA.works || []).find(w => w.id === id) || (DATA.works || [])[0];
      if (work) { visibleWorks = DATA.works.slice(); openLightbox(work.id); }
    }));
  }

  function openLightbox(id) {
    const list = visibleWorks.length ? visibleWorks : (DATA?.works || []);
    lbIndex = Math.max(0, list.findIndex(w => w.id === id));
    fillLightbox();
    const lb = $('#lightbox');
    lb.hidden = false;
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => lb.classList.add('open'));
    $('.lb-close', lb).focus({ preventScroll: true });
  }
  function fillLightbox() {
    const list = visibleWorks.length ? visibleWorks : (DATA?.works || []);
    const w = list[lbIndex];
    if (!w) return;
    const lb = $('#lightbox');
    const v = $('#lbVideo');
    lb.classList.toggle('portrait', w.orientation === 'portrait');
    v.poster = w.poster || '';
    v.src = w.video;
    v.muted = false;
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    $('#lbCat').textContent = [w.category, w.year].filter(Boolean).join(' · ');
    $('#lbTitle').textContent = w.title || '';
    $('#lbDesc').textContent = w.description || '';
    $('#lbCount').textContent = `${String(lbIndex + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    $('.lb-nav', lb).hidden = list.length < 2;
  }
  function stepLightbox(dir) {
    const list = visibleWorks.length ? visibleWorks : (DATA?.works || []);
    lbIndex = (lbIndex + dir + list.length) % list.length;
    fillLightbox();
  }
  function closeLightbox() {
    const lb = $('#lightbox');
    lb.classList.remove('open');
    const v = $('#lbVideo');
    v.pause();
    document.body.classList.remove('no-scroll');
    setTimeout(() => { lb.hidden = true; v.removeAttribute('src'); v.load(); }, reduceMotion ? 0 : 450);
  }

  /* ---------------- about / services ---------------- */
  function renderAbout(p, services) {
    const paras = Array.isArray(p.about) ? p.about : String(p.about || '').split(/\n\s*\n/);
    $('#aboutText').innerHTML = paras.filter(Boolean).map((t, i) => `<p class="reveal" style="--d:${0.15 + i * 0.08}s">${esc(t)}</p>`).join('');
    $('#services').innerHTML = services.map((s, i) => `
      <div class="service reveal" style="--d:${0.1 + i * 0.08}s">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <h4>${esc(s.title)}</h4>
        <p>${esc(s.text)}</p>
      </div>`).join('');
  }

  /* ---------------- skills ---------------- */
  function renderSkills(list) {
    const C = 176; // ring circumference (r = 28)
    $('#skillGrid').innerHTML = `
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a1f"/><stop offset="1" stop-color="#19c3b1"/></linearGradient>
      </defs></svg>` +
      list.map((s, i) => {
        const lvl = Math.max(0, Math.min(100, Number(s.level) || 0));
        return `
        <article class="skill reveal" style="--d:${i * 0.1}s; --lvl:${lvl}%; --off:${(C - (C * lvl) / 100).toFixed(1)}">
          <div class="skill-top">
            <span class="skill-icon">${esc(s.short || (s.name || '?').slice(0, 2))}</span>
            <svg class="skill-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" cx="32" cy="32" r="28"/></svg>
          </div>
          <h3>${esc(s.name)}</h3>
          <span class="lvl">${esc(s.label || '')}</span>
          ${s.use ? `<p>${esc(s.use)}</p>` : ''}
          <div class="skill-bar" role="img" aria-label="${esc(s.name)} ${lvl}%"><i></i></div>
        </article>`;
      }).join('');
  }

  /* ---------------- timeline ---------------- */
  function renderTimeline(items) {
    const tl = $('#timeline');
    tl.insertAdjacentHTML('beforeend', items.map((x, i) => {
      const current = /present|now/i.test(x.to || '');
      return `
      <div class="t-item reveal${current ? ' current' : ''}" style="--d:${i * 0.08}s">
        <div class="t-date">${esc(x.from)} — ${esc(x.to)}<small>${esc(x.place || '')}</small></div>
        <span class="t-dot" aria-hidden="true"></span>
        <div class="t-body">
          <div class="t-card">
            <h3>${esc(x.role)}${current ? '<span class="t-tag">Now</span>' : ''}</h3>
            <div class="t-company">${esc(x.company || '')}</div>
            ${x.description ? `<p>${esc(x.description)}</p>` : ''}
          </div>
        </div>
      </div>`;
    }).join(''));

    // draw the line as you scroll through the timeline
    const line = $('.timeline-line i', tl);
    const update = () => {
      const r = tl.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.75 - r.top) / r.height));
      line.style.setProperty('--p', p.toFixed(3));
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------------- contact ---------------- */
  function renderContactLinks(p) {
    const s = p.socials || {};
    const digits = v => String(v || '').replace(/[^\d]/g, '');
    const links = [
      p.email && { label: 'Email', value: p.email, href: 'mailto:' + p.email },
      p.whatsapp && { label: 'WhatsApp', value: p.whatsapp, href: 'https://wa.me/' + digits(p.whatsapp), ext: true },
      p.phone && { label: 'Phone', value: p.phone, href: 'tel:' + String(p.phone).replace(/\s+/g, '') },
      s.instagram && { label: 'Instagram', value: prettyUrl(s.instagram), href: s.instagram, ext: true },
      s.youtube && { label: 'YouTube', value: prettyUrl(s.youtube), href: s.youtube, ext: true },
      s.linkedin && { label: 'LinkedIn', value: prettyUrl(s.linkedin), href: s.linkedin, ext: true },
      s.behance && { label: 'Behance', value: prettyUrl(s.behance), href: s.behance, ext: true }
    ].filter(Boolean);
    $('#contactLinks').innerHTML = links.map(l => `
      <li><a href="${esc(l.href)}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>
        <span>${esc(l.label)}</span><strong>${esc(l.value)}</strong><i aria-hidden="true">↗</i>
      </a></li>`).join('');
  }
  function prettyUrl(u) { return String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''); }

  function setupContactForm() {
    const form = $('#contactForm');
    const status = $('#formStatus');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      let bad = false;
      [['name', v => v.trim().length > 0], ['email', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)], ['message', v => v.trim().length >= 5]]
        .forEach(([k, ok]) => {
          const field = form.elements[k].closest('.field');
          const fail = !ok(fd[k] || '');
          field.classList.toggle('invalid', fail);
          bad = bad || fail;
        });
      if (bad) { status.className = 'form-status err'; status.textContent = 'Please add your name, a valid email and a short message.'; return; }

      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; status.className = 'form-status'; status.textContent = 'Sending…';
      try {
        const endpoint = (DATA?.profile?.formEndpoint || '').trim();
        if (/^https:\/\//i.test(endpoint)) {
          // static hosting: send through a form service (Formspree, Web3Forms, Getform…)
          const payload = { ...fd, _subject: `${fd.type || 'Project'} enquiry from ${fd.name}` };
          delete payload.website;
          if (DATA.profile.formAccessKey) payload.access_key = DATA.profile.formAccessKey; // Web3Forms
          const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('Could not send right now. Please email me directly.');
          form.reset();
          status.className = 'form-status ok';
          status.textContent = 'Thank you! Your message has been sent — I will reply soon.';
          return;
        }
        const res = await fetch('api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd) });
        if (res.status === 404 || res.status === 405 || res.status === 403 || !(res.headers.get('content-type') || '').includes('json')) throw new Error('no-server');
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Could not send.');
        form.reset();
        status.className = 'form-status ok';
        status.textContent = 'Thank you! Your message has been sent — I will reply soon.';
      } catch (err) {
        if (err.message === 'no-server' || err instanceof TypeError) {
          // static hosting without the Node server → fall back to the visitor's email app
          const to = DATA?.profile?.email || '';
          const subject = encodeURIComponent(`${fd.type || 'Project'} enquiry from ${fd.name}`);
          const body = encodeURIComponent(`${fd.message}\n\n— ${fd.name} (${fd.email})`);
          window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
          status.className = 'form-status ok';
          status.textContent = 'Opening your email app to send the message…';
        } else {
          status.className = 'form-status err';
          status.textContent = err.message;
        }
      } finally { btn.disabled = false; }
    });
    form.addEventListener('input', e => { const f = e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
  }

  /* ---------------- hero title letter animation ---------------- */
  function splitHeroTitle() {
    let i = 0;
    $$('.hero-title .split').forEach(el => {
      const words = el.textContent.trim().split(/\s+/);
      el.setAttribute('aria-label', el.textContent.trim());
      el.innerHTML = words.map((w, wi) =>
        `<span style="display:inline-block;white-space:nowrap" aria-hidden="true">${[...w].map(ch => `<span class="char" style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>` +
        (wi < words.length - 1 ? '<span class="char space" aria-hidden="true"> </span>' : '')
      ).join('');
    });
  }

  /* ---------------- reveal on scroll + counters ---------------- */
  function setupReveal() {
    const targets = $$('.reveal, .work-card, .t-item, .skill');
    if (reduceMotion || !('IntersectionObserver' in window)) { targets.forEach(t => t.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        $$('.count', en.target).forEach(countUp);
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(t => io.observe(t));
  }

  function countUp(el) {
    const target = parseInt(el.textContent, 10);
    if (!target || el.dataset.done) return;
    el.dataset.done = '1';
    const dur = 1400, t0 = performance.now();
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // ease-in-out
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- header: shrink, hide on scroll down, active link, mobile menu ---------------- */
  function setupHeader() {
    const header = $('.site-header');
    const toggle = $('.menu-toggle');
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      header.classList.toggle('scrolled', y > 30);
      const menuOpen = header.classList.contains('menu-open');
      header.classList.toggle('hidden', !menuOpen && y > 400 && y > lastY + 4);
      if (y < lastY - 4) header.classList.remove('hidden');
      lastY = y;
    }, { passive: true });

    const setMenu = open => {
      header.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('no-scroll', open);
    };
    toggle.addEventListener('click', () => setMenu(!header.classList.contains('menu-open')));
    $$('.nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));

    // highlight the nav link of the section on screen
    const links = $$('.nav a[href^="#"]');
    const sections = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(s => io.observe(s));
    }
  }

  function setupScrollProgress() {
    const bar = $('.scroll-progress i');
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ---------------- custom cursor ---------------- */
  function setupCursor() {
    if (!finePointer || reduceMotion) return;
    document.documentElement.classList.add('has-cursor');
    const cursor = $('.cursor'), dot = $('.cursor-dot'), ring = $('.cursor-ring');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px, ${my}px)`; }, { passive: true });
    const loop = () => {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(loop);
    };
    loop();
    document.addEventListener('mouseover', e => {
      const play = e.target.closest('.work-media');
      cursor.classList.toggle('is-play', !!play);
      cursor.classList.toggle('is-hover', !play && !!e.target.closest('a, button, input, textarea, select, label'));
    });
    document.addEventListener('mouseleave', () => cursor.style.opacity = '0');
    document.addEventListener('mouseenter', () => cursor.style.opacity = '1');
  }

  /* ---------------- magnetic buttons ---------------- */
  function setupMagnetic() {
    if (!finePointer || reduceMotion) return;
    $$('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------------- hero shapes follow the mouse a little ---------------- */
  function setupParallax() {
    if (!finePointer || reduceMotion) return;
    const shapes = $$('.hero-shapes .shape');
    const hero = $('.hero');
    let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    hero.addEventListener('mousemove', e => {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
      if (!running) { running = true; requestAnimationFrame(loop); }
    });
    function loop() {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      shapes.forEach(s => {
        const d = parseFloat(s.dataset.depth || 1) * 14;
        s.style.transform = `translate(${cx * d}px, ${cy * d}px)`;
      });
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(loop); else running = false;
    }
  }
})();
