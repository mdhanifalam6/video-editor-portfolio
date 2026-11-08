/* Portfolio Admin — talks to server.js (/api/*) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let DATA = null;
  let SESSION = {};
  let dirty = false;

  /* ---------------- api helpers ---------------- */
  async function api(path, { method = 'GET', body, raw } = {}) {
    const opts = { method, headers: { 'X-Requested-With': 'admin' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch('/api' + path, opts);
    const out = raw ? res : await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { showAuth(false); throw new Error(out.error || 'Please log in again.'); }
    if (!res.ok) throw new Error(out.error || 'Request failed (' + res.status + ')');
    return out;
  }

  function upload(file, kind, onProgress, nameOverride) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const name = nameOverride || file.name || 'file.bin';
      xhr.open('POST', `/api/upload?kind=${kind}&name=${encodeURIComponent(name)}`);
      xhr.setRequestHeader('X-Requested-With', 'admin');
      xhr.withCredentials = true;
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let out = {}; try { out = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(out); else reject(new Error(out.error || 'Upload failed (' + xhr.status + ')'));
      };
      xhr.onerror = () => reject(new Error('Network error while uploading.'));
      xhr.send(file);
    });
  }

  async function saveData(message = 'Saved. Press "Publish to GitHub" to put it online.') {
    const out = await api('/data', { method: 'PUT', body: DATA });
    DATA.updatedAt = out.updatedAt;
    dirty = false;
    toast(message);
    refreshPublish();
    return out;
  }

  /* ---------------- GitHub publish ---------------- */
  async function refreshPublish() {
    let st;
    try { st = await api('/publish/status'); } catch { return; }
    const badge = $('#pubBadge');
    badge.hidden = !st.ready || !st.changes;
    badge.textContent = st.changes || '';
    $('#ghState').innerHTML = st.ready
      ? `Connected to <code>${esc(st.remote)}</code><br>Live site: <a href="${esc(st.pagesUrl)}" target="_blank" rel="noopener">${esc(st.pagesUrl)}</a><br>${st.changes ? `<strong>${st.changes}</strong> unpublished change(s).` : 'Everything is published.'}`
      : 'This folder is not connected to a GitHub repository yet (see README).';
    $('#publishBtn').dataset.ready = st.ready ? '1' : '';
    $('#publishBtn').dataset.url = st.pagesUrl || '';
  }

  $('#publishBtn').addEventListener('click', async () => {
    const btn = $('#publishBtn');
    if (dirty) { collectProfile(); collectRows(); try { await saveData('Saved.'); } catch (e) { return fail(e); } }
    if (!btn.dataset.ready) return toast('Not connected to GitHub yet — see README.', true);
    btn.disabled = true;
    const label = btn.firstChild.textContent;
    btn.firstChild.textContent = 'Publishing… ';
    try {
      const out = await api('/publish', { method: 'POST' });
      toast(out.committed ? 'Published! GitHub updates the live site in about 1 minute.' : 'Nothing new to publish — site is up to date.');
    } catch (e) { fail(e); }
    finally { btn.disabled = false; btn.firstChild.textContent = label; refreshPublish(); }
  });

  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', isErr);
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), isErr ? 5000 : 2600);
  }
  const fail = e => { console.error(e); toast(e.message || String(e), true); };

  /* ---------------- auth ---------------- */
  boot();
  async function boot() {
    try {
      SESSION = await api('/session');
    } catch (e) {
      document.body.innerHTML = '<p style="padding:40px">Cannot reach the server. Start it with <code>node server.js</code> and open <code>http://localhost:3000/admin</code>.</p>';
      return;
    }
    if (SESSION.authed) return startApp();
    showAuth(SESSION.needsSetup);
  }

  function showAuth(setup) {
    $('#app').hidden = true;
    $('#auth').hidden = false;
    $('#authTitle').textContent = setup ? 'Create your admin password' : 'Log in';
    $('#authHint').textContent = setup
      ? 'First time here — choose a password (8+ characters). You will use it to log in and manage your portfolio.'
      : 'Enter your admin password to manage your portfolio.';
    $('#authConfirmWrap').hidden = !setup;
    $('#authBtn').textContent = setup ? 'Create password' : 'Log in';
    $('#authPass').autocomplete = setup ? 'new-password' : 'current-password';
    $('#authForm').dataset.mode = setup ? 'setup' : 'login';
    $('#authPass').focus();
  }

  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const mode = e.currentTarget.dataset.mode;
    const pw = $('#authPass').value;
    $('#authErr').textContent = '';
    if (mode === 'setup' && pw !== $('#authConfirm').value) { $('#authErr').textContent = 'Passwords do not match.'; return; }
    try {
      await api(mode === 'setup' ? '/setup' : '/login', { method: 'POST', body: { password: pw } });
      $('#authPass').value = ''; $('#authConfirm').value = '';
      SESSION = await api('/session');
      startApp();
    } catch (err) { $('#authErr').textContent = err.message; }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    await api('/logout', { method: 'POST' }).catch(() => {});
    dirty = false;
    showAuth(false);
  });

  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- app ---------------- */
  let started = false;
  async function startApp() {
    $('#auth').hidden = true;
    $('#app').hidden = false;
    try { DATA = await api('/data'); } catch (e) { return fail(e); }
    DATA.profile = DATA.profile || {}; DATA.works = DATA.works || [];
    DATA.software = DATA.software || []; DATA.experience = DATA.experience || []; DATA.services = DATA.services || [];
    renderWorks(); fillProfile(); renderRows(); loadMessages(); refreshPublish();
    $('#ffmpegState').textContent = SESSION.ffmpeg
      ? 'ffmpeg found — hover previews are made automatically.'
      : 'ffmpeg not found — the full video is used for hover previews (works fine, uses a bit more data).';
    if (started) return;
    started = true;
    setupTabs(); setupAddForm(); setupProfile(); setupRowEditors(); setupPassword();
  }

  function setupTabs() {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.toggle('active', x === t));
      $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
      if (t.dataset.tab === 'messages') loadMessages();
    }));
    $$('[data-save]').forEach(b => b.addEventListener('click', async () => {
      collectProfile(); collectRows();
      b.disabled = true;
      try { await saveData(); } catch (e) { fail(e); } finally { b.disabled = false; }
    }));
  }

  /* ================= WORKS ================= */
  function renderWorks() {
    const list = $('#worksList');
    const cats = [...new Set(DATA.works.map(w => w.category).filter(Boolean))];
    $('#catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
    if (!DATA.works.length) { list.innerHTML = '<div class="empty">No work yet — add your first video above.</div>'; refreshShowreelSelect(); return; }
    list.innerHTML = DATA.works.map((w, i) => `
      <div class="w-row" draggable="true" data-i="${i}">
        <span class="w-handle" title="Drag to reorder">⋮⋮</span>
        ${w.poster ? `<img class="w-thumb ${w.orientation === 'portrait' ? 'portrait' : ''}" src="/${esc(w.poster)}" alt="">` : `<video class="w-thumb" src="/${esc(w.video)}#t=1" muted preload="metadata"></video>`}
        <div>
          <div class="w-title">${esc(w.title)}</div>
          <div class="w-sub">${esc(w.category || '—')} · ${w.orientation === 'portrait' ? 'Vertical 9:16' : 'Horizontal 16:9'}${w.year ? ' · ' + esc(w.year) : ''}${DATA.profile.showreelWorkId === w.id ? ' · ★ Showreel' : ''}</div>
        </div>
        <div class="w-actions">
          <button class="icon-btn" data-act="up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="down" title="Move down" ${i === DATA.works.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-act="edit" title="Edit">✎</button>
          <a class="icon-btn" href="/${esc(w.video)}" target="_blank" rel="noopener" title="Open video">▶</a>
          <button class="icon-btn danger" data-act="delete" title="Delete">🗑</button>
        </div>
      </div>`).join('');
    refreshShowreelSelect();
  }

  $('#worksList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.w-row');
    const i = Number(row.dataset.i);
    const w = DATA.works[i];
    const act = btn.dataset.act;
    try {
      if (act === 'up' || act === 'down') {
        const j = act === 'up' ? i - 1 : i + 1;
        [DATA.works[i], DATA.works[j]] = [DATA.works[j], DATA.works[i]];
        renderWorks(); await saveData('Order updated.');
      } else if (act === 'delete') {
        if (!confirm(`Delete "${w.title}"?\n\nThe video and its thumbnail will be removed from your site and from the server.`)) return;
        DATA.works.splice(i, 1);
        if (DATA.profile.showreelWorkId === w.id) DATA.profile.showreelWorkId = DATA.works[0]?.id || '';
        renderWorks(); await saveData('Deleted.');
      } else if (act === 'edit') {
        openEditor(row, w);
      }
    } catch (err) { fail(err); }
  });

  function openEditor(row, w) {
    const open = $('.w-edit', row);
    if (open) { open.remove(); return; }
    $$('.w-edit').forEach(x => x.remove());
    row.insertAdjacentHTML('beforeend', `
      <form class="w-edit">
        <div class="grid2">
          <label class="fld"><span>Title</span><input name="title" value="${esc(w.title)}" required maxlength="120"></label>
          <label class="fld"><span>Category</span><input name="category" value="${esc(w.category)}" list="catList" required maxlength="40"></label>
          <label class="fld"><span>Year</span><input name="year" value="${esc(w.year || '')}" maxlength="10"></label>
          <label class="fld"><span>Shape</span><select name="orientation"><option value="landscape"${w.orientation !== 'portrait' ? ' selected' : ''}>Horizontal 16:9</option><option value="portrait"${w.orientation === 'portrait' ? ' selected' : ''}>Vertical 9:16</option></select></label>
        </div>
        <label class="fld"><span>Description</span><textarea name="description" rows="2" maxlength="300">${esc(w.description || '')}</textarea></label>
        <label class="fld"><span>Replace thumbnail (optional)</span><input type="file" name="thumb" accept="image/jpeg,image/png,image/webp"></label>
        <div class="row-end"><button type="button" class="btn ghost sm" data-cancel>Cancel</button><button class="btn primary sm" type="submit">Save</button></div>
      </form>`);
    const form = $('.w-edit', row);
    row.draggable = false;
    form.querySelector('[data-cancel]').onclick = () => { form.remove(); row.draggable = true; };
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = form.elements;
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        if (f.thumb.files[0]) {
          const up = await upload(f.thumb.files[0], 'work');
          w.poster = up.path;
        }
        Object.assign(w, {
          title: f.title.value.trim(), category: f.category.value.trim(), year: f.year.value.trim(),
          orientation: f.orientation.value, description: f.description.value.trim()
        });
        renderWorks(); await saveData('Project updated.');
      } catch (err) { fail(err); btn.disabled = false; }
    });
  }

  // drag & drop reordering
  (() => {
    const list = $('#worksList');
    let from = null;
    list.addEventListener('dragstart', e => {
      const row = e.target.closest('.w-row'); if (!row) return;
      from = Number(row.dataset.i); row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragend', e => { const r = e.target.closest('.w-row'); if (r) r.classList.remove('dragging'); });
    list.addEventListener('dragover', e => {
      const row = e.target.closest('.w-row'); if (!row || from === null) return;
      e.preventDefault();
      $$('.w-row', list).forEach(r => r.classList.toggle('drag-over', r === row));
    });
    list.addEventListener('drop', async e => {
      const row = e.target.closest('.w-row'); if (!row || from === null) return;
      e.preventDefault();
      const to = Number(row.dataset.i);
      if (to !== from) {
        const [m] = DATA.works.splice(from, 1);
        DATA.works.splice(to, 0, m);
        renderWorks();
        try { await saveData('Order updated.'); } catch (err) { fail(err); }
      }
      from = null;
      $$('.w-row', list).forEach(r => r.classList.remove('drag-over'));
    });
  })();

  /* ---------- add new work ---------- */
  let pickedFile = null, localMeta = null, localUrl = null;

  function setupAddForm() {
    const drop = $('#drop'), input = $('#videoInput'), vid = $('#localPreview');
    $('#pickVideo').onclick = () => input.click();
    $('#clearVideo').onclick = () => { input.value = ''; setPicked(null); input.click(); };
    input.onchange = () => setPicked(input.files[0] || null);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) setPicked(f); });

    $('#posterTime').oninput = e => {
      $('#posterTimeLabel').textContent = Number(e.target.value).toFixed(1) + 's';
      if (localMeta) vid.currentTime = Number(e.target.value);
    };
    $('#wThumb').onchange = () => { $('#posterPick').hidden = !pickedFile || !!$('#wThumb').files[0]; };
    $('#addForm').addEventListener('submit', onAdd);
  }

  function setPicked(file) {
    const vid = $('#localPreview');
    if (localUrl) URL.revokeObjectURL(localUrl);
    pickedFile = null; localMeta = null; localUrl = null;
    $('.drop-empty').hidden = !!file; $('.drop-file').hidden = !file; $('#posterPick').hidden = true;
    if (!file) { vid.removeAttribute('src'); return; }
    if (!/\.(mp4|m4v|webm)$/i.test(file.name)) { toast('Please choose an MP4 or WEBM video.', true); setPicked(null); return; }
    pickedFile = file;
    localUrl = URL.createObjectURL(file);
    vid.src = localUrl;
    $('#fileName').textContent = file.name;
    $('#fileMeta').textContent = (file.size / 1048576).toFixed(1) + ' MB · reading…';
    vid.onloadedmetadata = () => {
      localMeta = { w: vid.videoWidth, h: vid.videoHeight, duration: vid.duration };
      const portrait = localMeta.h > localMeta.w;
      $('#fileMeta').textContent = `${(file.size / 1048576).toFixed(1)} MB · ${localMeta.w}×${localMeta.h} · ${portrait ? 'vertical' : 'horizontal'} · ${Math.round(localMeta.duration)}s`;
      const slider = $('#posterTime');
      slider.max = Math.max(0.1, Math.floor(localMeta.duration * 10) / 10 - 0.1);
      slider.value = Math.min(1, slider.max);
      $('#posterTimeLabel').textContent = Number(slider.value).toFixed(1) + 's';
      vid.currentTime = Number(slider.value);
      $('#posterPick').hidden = !!$('#wThumb').files[0];
      if (!$('#wTitle').value) $('#wTitle').value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    };
    vid.onerror = () => { $('#fileMeta').textContent = 'This browser cannot preview the file, but it can still be uploaded.'; };
  }

  function captureFrame() {
    return new Promise(resolve => {
      const vid = $('#localPreview');
      if (!localMeta || !vid.videoWidth) return resolve(null);
      const scale = Math.min(1, 960 / Math.max(vid.videoWidth, vid.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(vid.videoWidth * scale); c.height = Math.round(vid.videoHeight * scale);
      try {
        c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b), 'image/jpeg', 0.82);
      } catch { resolve(null); }
    });
  }

  async function onAdd(e) {
    e.preventDefault();
    if (!pickedFile) return toast('Choose a video first.', true);
    const title = $('#wTitle').value.trim(), category = $('#wCategory').value.trim();
    if (!title || !category) return toast('Title and category are required.', true);

    const btn = $('#addBtn'), prog = $('#upProgress');
    const setProg = (p, label) => { prog.hidden = false; $('i', prog).style.width = (p * 100).toFixed(1) + '%'; $('span', prog).textContent = label; };
    btn.disabled = true;
    const uploaded = [];
    try {
      setProg(0, 'Uploading video… 0%');
      const v = await upload(pickedFile, 'work', p => setProg(p * 0.85, `Uploading video… ${Math.round(p * 100)}%`));
      uploaded.push(v.path);

      let poster = '';
      const thumbFile = $('#wThumb').files[0];
      setProg(0.88, 'Making thumbnail…');
      if (thumbFile) {
        poster = (await upload(thumbFile, 'work')).path;
      } else {
        const blob = await captureFrame();
        if (blob) poster = (await upload(blob, 'work', null, 'poster.jpg')).path;
      }
      if (poster) uploaded.push(poster);

      let preview = '';
      if (SESSION.ffmpeg) {
        setProg(0.94, 'Creating hover preview…');
        const opt = await api('/optimize?poster=' + (poster ? '0' : '1'), { method: 'POST', body: { path: v.path, posterAt: Number($('#posterTime').value) || 1 } });
        if (opt.ok) {
          preview = opt.preview;
          if (!poster && opt.poster) poster = opt.poster;
          if (opt.video) { uploaded[0] = opt.video; v.path = opt.video; } // compressed copy replaced the original
        }
      } else if (pickedFile.size > 95 * 1048576) {
        throw new Error('This video is over 95 MB. GitHub cannot host it — export a smaller MP4 (1080p, H.264) and try again.');
      }

      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6);
      DATA.works.unshift({
        id, title, category,
        description: $('#wDesc').value.trim(),
        year: $('#wYear').value.trim() || String(new Date().getFullYear()),
        video: v.path, preview, poster,
        orientation: localMeta && localMeta.h > localMeta.w ? 'portrait' : 'landscape'
      });
      setProg(1, 'Publishing…');
      await saveData('Published! Your new work is live.');
      renderWorks();
      $('#addForm').reset(); $('#wThumb').value = ''; setPicked(null);
    } catch (err) {
      fail(err);
      for (const p of uploaded) api('/media?path=' + encodeURIComponent(p), { method: 'DELETE' }).catch(() => {});
    } finally {
      btn.disabled = false;
      setTimeout(() => { prog.hidden = true; }, 800);
    }
  }

  /* ================= PROFILE ================= */
  const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };

  function fillProfile() {
    $$('[data-p]').forEach(el => {
      let v = getP(DATA.profile, el.dataset.p);
      if (el.dataset.p === 'about') v = Array.isArray(v) ? v.join('\n\n') : (v || '');
      if (el.tagName !== 'SELECT') el.value = v ?? '';
    });
    refreshShowreelSelect();
    renderPhoto();
  }
  function refreshShowreelSelect() {
    const sel = $('#showreelSelect');
    if (!sel || !DATA) return;
    sel.innerHTML = DATA.works.map(w => `<option value="${esc(w.id)}">${esc(w.title)}</option>`).join('') || '<option value="">(no work yet)</option>';
    sel.value = DATA.profile.showreelWorkId || DATA.works[0]?.id || '';
  }
  function collectProfile() {
    $$('[data-p]').forEach(el => {
      let v = el.value;
      if (el.dataset.p === 'about') v = v.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      else if (el.dataset.p === 'yearsExperience') v = Number(v) || 0;
      else v = v.trim();
      setP(DATA.profile, el.dataset.p, v);
    });
  }
  function renderPhoto() {
    const p = DATA.profile.photo;
    $('#photoBox').innerHTML = p ? `<img src="/${esc(p)}" alt="Profile photo">` : '<span>No photo yet<br><small>(a monogram is shown)</small></span>';
    $('#photoRemove').hidden = !p;
  }
  function setupProfile() {
    $$('[data-p]').forEach(el => el.addEventListener('input', () => { dirty = true; }));
    $('#photoPick').onclick = () => $('#photoInput').click();
    $('#photoInput').onchange = async () => {
      const f = $('#photoInput').files[0]; if (!f) return;
      try {
        toast('Uploading photo…');
        const up = await upload(f, 'profile');
        collectProfile();
        DATA.profile.photo = up.path;
        renderPhoto();
        await saveData('Photo updated.');
      } catch (e) { fail(e); } finally { $('#photoInput').value = ''; }
    };
    $('#photoRemove').onclick = async () => {
      if (!confirm('Remove your photo?')) return;
      collectProfile(); DATA.profile.photo = ''; renderPhoto();
      try { await saveData('Photo removed.'); } catch (e) { fail(e); }
    };
  }

  /* ================= SKILLS / EXPERIENCE / SERVICES ================= */
  const ROWS = {
    software: { el: '#softwareRows', blank: { name: '', short: '', level: 80, label: 'Advanced', use: '' },
      tpl: r => `<div class="r-line r-soft">
          <input data-k="name" placeholder="Software name" value="${esc(r.name)}">
          <input data-k="short" placeholder="Icon (Pr)" maxlength="3" value="${esc(r.short)}">
          <input data-k="level" type="number" min="0" max="100" placeholder="0–100" value="${esc(r.level)}">
          <input data-k="label" placeholder="Expert / Advanced" value="${esc(r.label)}">
          ${tools()}
        </div>
        <input data-k="use" placeholder="What you use it for" value="${esc(r.use)}">` },
    experience: { el: '#experienceRows', blank: { from: '', to: 'Present', role: '', company: '', place: '', description: '' },
      tpl: r => `<div class="r-line r-exp">
          <input data-k="from" placeholder="From (2015)" value="${esc(r.from)}">
          <input data-k="to" placeholder="To (2018 / Present)" value="${esc(r.to)}">
          <input data-k="role" placeholder="Role / job title" value="${esc(r.role)}">
        </div>
        <div class="r-line r-exp2">
          <input data-k="company" placeholder="Company" value="${esc(r.company)}">
          <input data-k="place" placeholder="Place (KSA / Remote)" value="${esc(r.place)}">
          ${tools()}
        </div>
        <textarea data-k="description" rows="2" placeholder="One or two lines about this job">${esc(r.description)}</textarea>` },
    services: { el: '#servicesRows', blank: { title: '', text: '' },
      tpl: r => `<div class="r-line r-svc">
          <input data-k="title" placeholder="Service" value="${esc(r.title)}">
          <input data-k="text" placeholder="Short description" value="${esc(r.text)}">
          ${tools()}
        </div>` }
  };
  function tools() {
    return `<div class="r-tools"><button type="button" class="icon-btn" data-r="up" title="Move up">↑</button><button type="button" class="icon-btn" data-r="down" title="Move down">↓</button><button type="button" class="icon-btn danger" data-r="del" title="Remove">✕</button></div>`;
  }
  function renderRows() {
    for (const [key, cfg] of Object.entries(ROWS)) {
      $(cfg.el).innerHTML = DATA[key].map((r, i) => `<div class="r-item" data-key="${key}" data-i="${i}">${cfg.tpl(r)}</div>`).join('')
        || '<div class="empty">Nothing here yet.</div>';
    }
  }
  function collectRows() {
    for (const key of Object.keys(ROWS)) {
      $$(`.r-item[data-key="${key}"]`).forEach(item => {
        const r = DATA[key][Number(item.dataset.i)];
        $$('[data-k]', item).forEach(inp => { r[inp.dataset.k] = inp.dataset.k === 'level' ? Math.max(0, Math.min(100, Number(inp.value) || 0)) : inp.value.trim(); });
      });
    }
  }
  function setupRowEditors() {
    $$('[data-add]').forEach(b => b.addEventListener('click', () => {
      collectRows();
      const key = b.dataset.add;
      DATA[key].push({ ...ROWS[key].blank });
      renderRows(); dirty = true;
      const items = $$(`.r-item[data-key="${key}"]`); const last = items[items.length - 1];
      if (last) $('input', last).focus();
    }));
    $('[data-panel="skills"]').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      collectRows();
      const item = b.closest('.r-item'), key = item.dataset.key, i = Number(item.dataset.i), arr = DATA[key];
      if (b.dataset.r === 'del') { if (!confirm('Remove this item?')) return; arr.splice(i, 1); }
      if (b.dataset.r === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      if (b.dataset.r === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      renderRows(); dirty = true;
    });
    $('[data-panel="skills"]').addEventListener('input', () => { dirty = true; });
  }

  /* ================= MESSAGES ================= */
  async function loadMessages() {
    let list = [];
    try { list = await api('/messages'); } catch { return; }
    const unread = list.filter(m => !m.read).length;
    $('#msgBadge').hidden = !unread; $('#msgBadge').textContent = unread;
    $('#messagesList').innerHTML = list.length ? list.map(m => `
      <div class="msg${m.read ? '' : ' unread'}" data-id="${esc(m.id)}">
        <div class="msg-head">
          <div><strong>${esc(m.name)}</strong> <span class="muted">· ${esc(m.email)}${m.type ? ' · ' + esc(m.type) : ''}</span></div>
          <span class="muted small">${new Date(m.date).toLocaleString()}</span>
        </div>
        <p>${esc(m.message)}</p>
        <div class="row">
          <a class="btn primary sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: your ' + (m.type || 'project') + ' enquiry')}">Reply by email</a>
          ${m.read ? '' : '<button class="btn ghost sm" data-m="read">Mark as read</button>'}
          <button class="btn ghost sm danger" data-m="del">Delete</button>
        </div>
      </div>`).join('') : '<div class="empty">No messages yet. Enquiries from your contact form will show up here.</div>';
  }
  $('#messagesList').addEventListener('click', async e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const id = b.closest('.msg').dataset.id;
    try {
      if (b.dataset.m === 'del') { if (!confirm('Delete this message?')) return; await api('/messages/' + id, { method: 'DELETE' }); }
      else await api('/messages/' + id, { method: 'PATCH' });
      loadMessages();
    } catch (err) { fail(err); }
  });

  /* ================= SETTINGS ================= */
  function setupPassword() {
    $('#pwForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } });
        e.target.reset(); toast('Password updated.');
      } catch (err) { fail(err); }
    });
  }
})();
