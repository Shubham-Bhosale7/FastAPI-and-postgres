/* Rollbook: state, rendering and events */
(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = (name) => {
    const w = name.trim().split(/\s+/);
    return ((w[0] || "")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const { gradeFor, gradeKey } = Validation;
  const GRADES = ["A+", "A", "B", "C", "F"];

  const ICON = {
    edit: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5 3 3M4 16l.7-3.3 8.8-8.8 2.6 2.6-8.8 8.8L4 16Z"/></svg>',
    trash: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6"/></svg>',
    prev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5"/></svg>',
    next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg>',
  };

  /* ---------- state ---------- */
  const state = {
    course: "", sortBy: null, order: "asc", page: 1, limit: 10,
    data: null,      // last /students page response
    stats: null,     // summary of up to 100 students for the current course filter
    loading: true, error: null, found: null,
  };

  const el = {
    intro: $("#introSub"), overview: $("#overview"), found: $("#found"),
    tbody: $("#tbody"), wrap: $("#tableWrap"), pager: $("#pager"),
    course: $("#courseInput"), sort: $("#sortSelect"), limit: $("#limitSelect"),
    drawer: $("#drawer"), form: $("#studentForm"), save: $("#saveBtn"), preview: $("#gradePreview"),
    confirm: $("#confirm"), toasts: $("#toasts"), lookup: $("#lookup"), lookupInput: $("#lookupInput"),
  };
  const inputs = {
    id: $("#f-id"), name: $("#f-name"), age: $("#f-age"),
    marks: $("#f-marks"), course: $("#f-course"), email: $("#f-email"),
  };

  /* ---------- data ---------- */
  let controller;

  function summarize(res) {
    const list = res.students;
    const dist = Object.fromEntries(GRADES.map((g) => [g, 0]));
    let sum = 0;
    list.forEach((s) => { dist[gradeFor(s.marks)]++; sum += s.marks; });
    const n = list.length;
    return {
      total: res.total_students, sample: n, dist,
      avg: n ? Math.round((sum / n) * 10) / 10 : null,
      pass: n ? Math.round(((n - dist.F) / n) * 100) : null,
    };
  }

  async function load() {
    if (controller) controller.abort();
    controller = new AbortController();
    state.loading = true;
    state.error = null;
    render();
    const base = { course: state.course };
    try {
      const [pageRes, statsRes] = await Promise.all([
        Api.list({ ...base, sort_by: state.sortBy, order: state.order, page: state.page, limit: state.limit }, controller.signal),
        Api.list({ ...base, limit: 100 }, controller.signal),
      ]);
      if (!pageRes.students.length && pageRes.total_students > 0 && state.page > 1) {
        state.page = Math.ceil(pageRes.total_students / state.limit); // deleted the last row of the last page
        return load();
      }
      state.data = pageRes;
      state.stats = summarize(statsRes);
    } catch (err) {
      if (err.name === "AbortError") return;
      state.error = err.message;
    }
    state.loading = false;
    render();
  }

  /* ---------- rendering ---------- */
  function render() {
    renderIntro(); renderOverview(); renderFound(); renderSortUI(); renderTable(); renderPager();
  }

  function renderIntro() {
    const s = state.stats;
    if (state.error && !s) el.intro.textContent = "The roll couldn't be loaded.";
    else if (!s) el.intro.textContent = "Loading the roll…";
    else {
      const where = state.course ? ` enrolled in ${state.course}` : " on the roll";
      el.intro.textContent = `${plural(s.total, "student")}${where}.`;
    }
  }

  function renderOverview() {
    const s = state.stats;
    const num = (v, suffix = "") => (v === null || v === undefined ? "–" : v + suffix);
    const bar = s && s.sample
      ? GRADES.filter((g) => s.dist[g]).map((g) =>
          `<i class="g-${gradeKey(g)}" style="flex:${s.dist[g]}" title="${g}: ${s.dist[g]}"></i>`).join("")
      : "";
    const legend = GRADES.map((g) =>
      `<li><span class="dot g-${gradeKey(g)}"></span>${g}<b>${s ? s.dist[g] : 0}</b></li>`).join("");
    const note = s && s.total > s.sample ? `<p class="fine muted">Based on the first ${s.sample} students.</p>` : "";

    el.overview.innerHTML = `
      <div class="stat"><span class="stat-num">${num(s && s.total)}</span><span class="muted">Students</span></div>
      <div class="stat"><span class="stat-num">${num(s && s.avg)}</span><span class="muted">Average marks</span></div>
      <div class="stat"><span class="stat-num">${num(s && s.pass, "%")}</span><span class="muted">Passing, 60 and above</span></div>
      <div class="spread">
        <span class="muted">Grade spread</span>
        <div class="bar${bar ? "" : " empty"}" role="img" aria-label="Grade distribution">${bar}</div>
        <ul class="legend">${legend}</ul>${note}
      </div>`;
  }

  function renderFound() {
    const s = state.found;
    if (!s) { el.found.innerHTML = ""; return; }
    const g = s.grade || gradeFor(s.marks);
    el.found.innerHTML = `
      <section class="found" aria-label="Lookup result">
        <span class="avatar lg" style="--h:${hue(s.id)}">${esc(initials(s.name))}</span>
        <div class="found-main">
          <div class="name">${esc(s.name)} <span class="muted">· ${esc(s.id)}</span></div>
          <div class="muted">${esc(s.course)} · age ${s.age} · ${s.marks} marks · ${esc(s.email)}</div>
        </div>
        <span class="grade g-${gradeKey(g)}">${esc(g)}</span>
        <button class="btn ghost" data-found="edit" type="button">Edit</button>
        <button class="icon-btn" data-found="dismiss" type="button" aria-label="Dismiss result">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>
        </button>
      </section>`;
  }

  function renderSortUI() {
    el.sort.value = state.sortBy ? `${state.sortBy}:${state.order}` : "";
    document.querySelectorAll("th[data-th]").forEach((th) => {
      const active = th.dataset.th === state.sortBy;
      th.setAttribute("aria-sort", active ? (state.order === "asc" ? "ascending" : "descending") : "none");
    });
  }

  function rowHTML(s) {
    const g = s.grade || gradeFor(s.marks);
    const k = gradeKey(g);
    return `
      <tr data-id="${esc(s.id)}">
        <td><div class="person">
          <span class="avatar" style="--h:${hue(s.id)}">${esc(initials(s.name))}</span>
          <div><div class="name">${esc(s.name)}</div><div class="email">${esc(s.email)}</div></div>
        </div></td>
        <td class="col-id">${esc(s.id)}</td>
        <td class="col-course">${esc(s.course)}</td>
        <td class="col-age">${s.age}</td>
        <td><div class="marks"><span>${s.marks}</span><span class="meter"><i class="g-${k}" style="width:${s.marks}%"></i></span></div></td>
        <td><span class="grade g-${k}">${esc(g)}</span></td>
        <td class="col-act"><div class="row-actions">
          <button class="icon-btn" data-action="edit" type="button" aria-label="Edit ${esc(s.name)}">${ICON.edit}</button>
          <button class="icon-btn danger" data-action="delete" type="button" aria-label="Delete ${esc(s.name)}">${ICON.trash}</button>
        </div></td>
      </tr>`;
  }

  function renderTable() {
    el.wrap.classList.toggle("is-loading", state.loading && !!state.data);
    if (state.error) {
      el.tbody.innerHTML = `<tr><td colspan="7"><div class="state">
        <h3>Couldn't load students</h3><p class="muted">${esc(state.error)}</p>
        <button class="btn" data-action="retry" type="button">Try again</button></div></td></tr>`;
      return;
    }
    if (state.loading && !state.data) {
      el.tbody.innerHTML = Array.from({ length: Math.min(state.limit, 6) }, () =>
        `<tr class="skel"><td><div class="person"><span class="avatar sk"></span><div class="grow"><span class="sk w60"></span><span class="sk w40"></span></div></div></td>
         <td class="col-id"><span class="sk w40"></span></td><td class="col-course"><span class="sk w60"></span></td>
         <td class="col-age"><span class="sk w30"></span></td><td><span class="sk w60"></span></td>
         <td><span class="sk w40"></span></td><td></td></tr>`).join("");
      return;
    }
    const list = state.data ? state.data.students : [];
    if (!list.length) {
      const filtered = !!state.course;
      el.tbody.innerHTML = `<tr><td colspan="7"><div class="state">
        <h3>${filtered ? `No students in “${esc(state.course)}”` : "No students yet"}</h3>
        <p class="muted">${filtered ? "Check the spelling or clear the filter." : "Add the first student to start the roll."}</p>
        <button class="btn ${filtered ? "" : "primary"}" data-action="${filtered ? "clear" : "add"}" type="button">${filtered ? "Clear filter" : "Add student"}</button>
      </div></td></tr>`;
      return;
    }
    el.tbody.innerHTML = list.map(rowHTML).join("");
  }

  function pageWindow(cur, pages) {
    const set = new Set([1, pages, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= pages));
    const out = [];
    [...set].sort((a, b) => a - b).forEach((p, i, arr) => {
      if (i && p - arr[i - 1] > 1) out.push("gap");
      out.push(p);
    });
    return out;
  }

  function renderPager() {
    const d = state.data;
    if (state.error || !d || !d.total_students) { el.pager.innerHTML = ""; return; }
    const pages = Math.max(1, Math.ceil(d.total_students / d.limit));
    const from = (d.page - 1) * d.limit + 1;
    const to = Math.min(d.total_students, d.page * d.limit);
    const nums = pageWindow(d.page, pages).map((p) =>
      p === "gap" ? '<span class="gap" aria-hidden="true">…</span>'
        : `<button type="button" class="pg${p === d.page ? " on" : ""}" data-page="${p}" ${p === d.page ? 'aria-current="page"' : ""}>${p}</button>`).join("");
    el.pager.innerHTML = `
      <span class="muted">Showing ${from} to ${to} of ${d.total_students}</span>
      <div class="pages">
        <button type="button" class="pg" data-page="${d.page - 1}" ${d.page <= 1 ? "disabled" : ""} aria-label="Previous page">${ICON.prev}</button>
        ${nums}
        <button type="button" class="pg" data-page="${d.page + 1}" ${d.page >= pages ? "disabled" : ""} aria-label="Next page">${ICON.next}</button>
      </div>`;
  }

  /* ---------- toasts ---------- */
  function toast(message, kind = "ok") {
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.textContent = message;
    el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  /* ---------- add / edit drawer ---------- */
  let editing = null;
  let submitted = false;

  function showErrors(errors) {
    Object.keys(inputs).forEach((k) => {
      const field = $(`[data-field="${k}"]`);
      const msg = errors[k] || "";
      field.classList.toggle("invalid", !!msg);
      $(".err", field).textContent = msg;
      inputs[k].setAttribute("aria-invalid", msg ? "true" : "false");
    });
  }

  const readForm = () => ({
    id: editing ? editing.id : inputs.id.value,
    name: inputs.name.value, age: inputs.age.value, marks: inputs.marks.value,
    course: inputs.course.value, email: inputs.email.value,
  });

  function updateGradePreview() {
    const raw = inputs.marks.value.trim();
    const m = Number(raw);
    const ok = raw !== "" && Number.isInteger(m) && m >= 0 && m <= 100;
    const g = ok ? gradeFor(m) : null;
    el.preview.textContent = g || "–";
    el.preview.className = "grade" + (g ? ` g-${gradeKey(g)}` : "");
  }

  function openDrawer(student = null) {
    editing = student;
    submitted = false;
    $("#drawerTitle").textContent = student ? `Edit ${student.name}` : "Add student";
    el.save.textContent = student ? "Save changes" : "Create student";
    inputs.id.value = student ? student.id : "";
    inputs.id.disabled = !!student;
    inputs.name.value = student ? student.name : "";
    inputs.age.value = student ? student.age : "";
    inputs.marks.value = student ? student.marks : "";
    inputs.course.value = student ? student.course : "";
    inputs.email.value = student ? student.email : "";
    showErrors({});
    updateGradePreview();
    el.drawer.showModal();
    (student ? inputs.name : inputs.id).focus();
  }

  const closeDrawer = () => el.drawer.close();

  function serverFieldErrors(err) {
    if (err.fields) return err.fields;
    if (/email/i.test(err.message)) return { email: err.message };
    if (/\bId\b/.test(err.message)) return { id: err.message };
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    submitted = true;
    const { errors, clean } = Validation.validate(readForm());
    showErrors(errors);
    const firstBad = Object.keys(errors)[0];
    if (firstBad) { inputs[firstBad].focus(); return; }

    el.save.disabled = true;
    const label = el.save.textContent;
    el.save.textContent = "Saving…";
    try {
      if (editing) {
        const changes = Validation.diff(editing, clean);
        if (!Object.keys(changes).length) { closeDrawer(); toast("No changes to save"); return; }
        await Api.update(editing.id, changes);
        toast(`${clean.name} updated`);
      } else {
        await Api.create(clean);
        toast(`${clean.name} added`);
      }
      state.found = null;
      closeDrawer();
      load();
    } catch (err) {
      const fields = serverFieldErrors(err);
      if (fields) {
        showErrors(fields);
        const k = Object.keys(fields).find((f) => inputs[f]);
        if (k) inputs[k].focus();
      }
      toast(err.message, "error");
    } finally {
      el.save.disabled = false;
      el.save.textContent = label;
    }
  }

  /* ---------- delete ---------- */
  async function confirmDelete(student) {
    $("#confirmText").textContent = `${student.name} (${student.id}) will be removed from the roll. This can't be undone.`;
    el.confirm.returnValue = "";
    el.confirm.showModal();
    await new Promise((r) => el.confirm.addEventListener("close", r, { once: true }));
    if (el.confirm.returnValue !== "ok") return;
    try {
      await Api.remove(student.id);
      toast(`${student.name} deleted`);
      if (state.found && state.found.id === student.id) state.found = null;
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  /* ---------- events ---------- */
  const studentById = (id) => (state.data ? state.data.students.find((s) => s.id === id) : null);

  function cycleSort(field) {
    if (state.sortBy !== field) { state.sortBy = field; state.order = "asc"; }
    else if (state.order === "asc") state.order = "desc";
    else { state.sortBy = null; state.order = "asc"; }
    state.page = 1;
    load();
  }

  function bind() {
    $("#addBtn").addEventListener("click", () => openDrawer());

    $("#themeBtn").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("rollbook-theme", next); } catch (e) {}
    });

    el.course.addEventListener("input", debounce(() => {
      state.course = el.course.value.trim();
      state.page = 1;
      load();
    }, 300));

    el.sort.addEventListener("change", () => {
      const [by, order] = el.sort.value ? el.sort.value.split(":") : [null, "asc"];
      state.sortBy = by; state.order = order; state.page = 1;
      load();
    });

    el.limit.addEventListener("change", () => { state.limit = Number(el.limit.value); state.page = 1; load(); });

    document.querySelector("thead").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sort]");
      if (b) cycleSort(b.dataset.sort);
    });

    el.tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const row = btn.closest("tr");
      const student = row && row.dataset.id ? studentById(row.dataset.id) : null;
      switch (btn.dataset.action) {
        case "edit": if (student) openDrawer(student); break;
        case "delete": if (student) confirmDelete(student); break;
        case "retry": load(); break;
        case "add": openDrawer(); break;
        case "clear": el.course.value = ""; state.course = ""; state.page = 1; load(); break;
      }
    });

    el.pager.addEventListener("click", (e) => {
      const b = e.target.closest("[data-page]");
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page);
      load();
      window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });

    el.found.addEventListener("click", (e) => {
      const b = e.target.closest("[data-found]");
      if (!b) return;
      if (b.dataset.found === "edit") openDrawer(state.found);
      else { state.found = null; renderFound(); }
    });

    el.lookup.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = el.lookupInput.value.trim();
      if (!id) return;
      try {
        state.found = await Api.get(id);
        renderFound();
      } catch (err) {
        state.found = null;
        renderFound();
        toast(err.message, "error");
      }
    });

    document.addEventListener("keydown", (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement.tagName);
      if (e.key === "/" && !typing && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        el.lookupInput.focus();
      }
    });

    // Drawer
    el.form.addEventListener("submit", onSubmit);
    el.drawer.addEventListener("click", (e) => { if (e.target === el.drawer || e.target.closest("[data-close]")) closeDrawer(); });
    el.confirm.addEventListener("click", (e) => { if (e.target === el.confirm) el.confirm.close("cancel"); });
    el.form.addEventListener("input", () => {
      updateGradePreview();
      if (submitted) showErrors(Validation.validate(readForm()).errors);
    });
  }

  bind();
  load();
})();
