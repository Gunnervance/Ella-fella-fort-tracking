/* Squad Tracker — post-match log + squad dashboard. Plain JS, Supabase backend. */
(function () {
  "use strict";

  const cfg = window.SQUAD_CONFIG;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    players: [],
    matches: [], // each: {..., match_stats: [...]}
    range: "session",
    mode: "all",
  };

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem("st:" + k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem("st:" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  // ---------- Setup ----------
  document.title = cfg.squadName;
  $("#squad-name").textContent = cfg.squadName;

  if (!window.supabase || !window.supabase.createClient) {
    showBanner("Couldn't load the database library. Check your internet connection and refresh.");
    return;
  }
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  function showBanner(html) {
    const b = $("#banner");
    b.innerHTML = html;
    b.hidden = false;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Tabs ----------
  function showTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    ["log", "dash", "history", "squad"].forEach((n) => { $("#tab-" + n).hidden = n !== name; });
    if (name === "dash") renderDashboard();
    if (name === "history") renderHistory();
    if (name === "squad") renderSquad();
    store.set("tab", name);
    if (history.replaceState) history.replaceState(null, "", "#" + name);
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-goto]");
    if (a) { e.preventDefault(); showTab(a.dataset.goto); }
  });

  // ---------- Data ----------
  async function loadAll() {
    const [p, m] = await Promise.all([
      db.from("players").select("*").order("created_at", { ascending: true }),
      db.from("matches").select("*, match_stats(*)").order("played_at", { ascending: false }),
    ]);
    if (p.error || m.error) {
      const err = p.error || m.error;
      const missing = /relation|does not exist|schema cache/i.test(err.message || "");
      showBanner(missing
        ? "The database tables aren't set up yet. In Supabase, open <b>SQL Editor</b>, paste the contents of <code>schema.sql</code>, and click <b>Run</b>. Then refresh this page."
        : "Couldn't reach the database: " + esc(err.message) + ". Check the URL and key in <code>config.js</code>.");
      return false;
    }
    $("#banner").hidden = true;
    state.players = p.data || [];
    state.matches = m.data || [];
    return true;
  }

  function playerName(id) {
    const p = state.players.find((x) => x.id === id);
    return p ? p.gamertag : "Former player";
  }

  // ---------- Log form ----------
  function fillSelect(sel, items, selected) {
    sel.innerHTML = items.map((v) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");
  }

  function nowLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function setupForm() {
    fillSelect($("#f-mode"), cfg.modes, store.get("lastMode", cfg.modes[0]));
    fillSelect($("#f-elim"), cfg.elimCauses, cfg.elimCauses[1]);
    $("#f-when").value = nowLocal();
    renderFormPlayers();
    renderDropList();
  }

  function renderDropList() {
    const spots = [...new Set(state.matches.map((m) => (m.drop_spot || "").trim()).filter(Boolean))].sort();
    $("#drop-list").innerHTML = spots.map((s) => `<option value="${esc(s)}"></option>`).join("");
  }

  function renderFormPlayers() {
    const active = state.players.filter((p) => p.active);
    const lastPlayed = store.get("lastPlayed", null);
    $("#no-players").hidden = active.length > 0;
    $("#f-players").innerHTML = active.map((p) => {
      const on = lastPlayed ? lastPlayed.includes(p.id) : true;
      return `
        <div class="player-row${on ? "" : " is-off"}" data-id="${p.id}">
          <label class="check"><input type="checkbox" class="p-on" ${on ? "checked" : ""}><span class="tag">${esc(p.gamertag)}</span></label>
          <input type="number" class="p-kills" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(p.gamertag)} kills">
          <input type="number" class="p-dmg" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(p.gamertag)} damage">
          <input type="number" class="p-ast" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(p.gamertag)} assists">
        </div>`;
    }).join("");
    $$("#f-players .p-on").forEach((cb) => cb.addEventListener("change", () => {
      cb.closest(".player-row").classList.toggle("is-off", !cb.checked);
    }));
  }

  $("#f-placement").addEventListener("input", () => {
    if ($("#f-placement").value === "1") $("#f-elim").value = cfg.elimCauses[0];
  });

  $("#log-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#f-status");
    const placement = parseInt($("#f-placement").value, 10);
    if (!placement || placement < 1 || placement > 100) {
      status.className = "status err"; status.textContent = "Enter a placement from 1 to 100.";
      $("#f-placement").focus(); return;
    }
    const rows = $$("#f-players .player-row").filter((r) => r.querySelector(".p-on").checked);
    if (!rows.length) {
      status.className = "status err"; status.textContent = "Check at least one player who played.";
      return;
    }
    const num = (el) => Math.max(0, parseInt(el.value, 10) || 0);
    const whenVal = $("#f-when").value;
    const match = {
      played_at: whenVal ? new Date(whenVal).toISOString() : new Date().toISOString(),
      mode: $("#f-mode").value,
      placement,
      drop_spot: $("#f-drop").value.trim() || null,
      elim_cause: placement === 1 ? cfg.elimCauses[0] : $("#f-elim").value,
      notes: $("#f-notes").value.trim() || null,
    };

    const btn = $("#f-submit");
    btn.disabled = true; status.className = "status"; status.textContent = "Saving…";
    const ins = await db.from("matches").insert(match).select().single();
    if (ins.error) {
      btn.disabled = false; status.className = "status err";
      status.textContent = "Couldn't save: " + ins.error.message; return;
    }
    const stats = rows.map((r) => ({
      match_id: ins.data.id,
      player_id: r.dataset.id,
      kills: num(r.querySelector(".p-kills")),
      damage: num(r.querySelector(".p-dmg")),
      assists: num(r.querySelector(".p-ast")),
    }));
    const st = await db.from("match_stats").insert(stats);
    if (st.error) {
      await db.from("matches").delete().eq("id", ins.data.id);
      btn.disabled = false; status.className = "status err";
      status.textContent = "Couldn't save player stats: " + st.error.message; return;
    }

    store.set("lastMode", match.mode);
    store.set("lastPlayed", rows.map((r) => r.dataset.id));
    const keepDrop = $("#f-drop").value;
    await loadAll();
    $("#f-placement").value = "";
    $("#f-notes").value = "";
    $("#f-when").value = nowLocal();
    $$("#f-players input[type=number]").forEach((i) => { i.value = ""; });
    $("#f-drop").value = keepDrop;
    renderDropList();
    btn.disabled = false;
    status.className = "status ok";
    status.textContent = placement === 1 ? "Victory saved. Nice." : `Saved: #${placement} in ${match.mode}.`;
    setTimeout(() => { if (status.textContent.startsWith("Saved") || status.textContent.startsWith("Victory")) status.textContent = ""; }, 5000);
  });

  // ---------- Filtering ----------
  const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

  function filtered() {
    let list = state.matches.slice(); // newest first
    if (state.mode !== "all") list = list.filter((m) => m.mode === state.mode);
    if (state.range === "session") {
      if (!list.length) return { list, label: "" };
      const out = [list[0]];
      for (let i = 1; i < list.length; i++) {
        const gap = new Date(list[i - 1].played_at) - new Date(list[i].played_at);
        if (gap > SESSION_GAP_MS) break;
        out.push(list[i]);
      }
      const day = new Date(out[0].played_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      return { list: out, label: `Last session: ${day}. A session is games played without a 3-hour break.` };
    }
    if (state.range === "all") return { list, label: "All logged games." };
    const days = parseInt(state.range, 10);
    const cutoff = Date.now() - days * 86400000;
    return { list: list.filter((m) => new Date(m.played_at) >= cutoff), label: `Games from the last ${days} days.` };
  }

  $$("#range-seg button").forEach((b) => b.addEventListener("click", () => {
    $$("#range-seg button").forEach((x) => x.classList.toggle("is-active", x === b));
    state.range = b.dataset.range;
    store.set("range", state.range);
    renderDashboard();
  }));
  $("#mode-filter").addEventListener("change", (e) => { state.mode = e.target.value; renderDashboard(); });

  // ---------- Dashboard ----------
  let chart = null;
  const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "–");
  const pct = (n) => (Number.isFinite(n) ? Math.round(n * 100) + "%" : "–");

  function renderDashboard() {
    const modesPresent = ["all", ...cfg.modes];
    $("#mode-filter").innerHTML = modesPresent.map((m) => `<option value="${esc(m)}"${m === state.mode ? " selected" : ""}>${m === "all" ? "All modes" : esc(m)}</option>`).join("");

    const { list, label } = filtered();
    $("#range-label").textContent = label;
    const empty = list.length === 0;
    $("#dash-empty").hidden = !empty;
    $("#dash-body").hidden = empty;
    if (empty) return;

    // KPIs
    const games = list.length;
    const wins = list.filter((m) => m.placement === 1).length;
    const top10 = list.filter((m) => m.placement <= 10).length;
    const avgPlace = list.reduce((s, m) => s + m.placement, 0) / games;
    const squadKills = list.reduce((s, m) => s + (m.match_stats || []).reduce((a, x) => a + x.kills, 0), 0);
    const squadDmg = list.reduce((s, m) => s + (m.match_stats || []).reduce((a, x) => a + x.damage, 0), 0);
    const kpis = [
      { label: "Games", value: games },
      { label: "Wins", value: wins, cls: wins ? "gold" : "" },
      { label: "Win rate", value: pct(wins / games) },
      { label: "Avg placement", value: "#" + fmt1(avgPlace) },
      { label: "Top 10 rate", value: pct(top10 / games) },
      { label: "Squad kills / game", value: fmt1(squadKills / games), note: Math.round(squadDmg / games) + " dmg / game" },
    ];
    $("#kpis").innerHTML = kpis.map((k) => `
      <div class="kpi"><div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.cls || ""}">${k.value}</div>${k.note ? `<div class="kpi-note">${k.note}</div>` : ""}</div>`).join("");

    renderPlacementChart(list.slice().reverse());
    renderElimBars(list);
    renderPlayerTable(list);
    renderDropTable(list);
  }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function renderPlacementChart(chrono) {
    if (!window.Chart) return;
    const labels = chrono.map((m) => new Date(m.played_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    const data = chrono.map((m) => m.placement);
    // rolling average over last 5 games
    const avg = data.map((_, i) => {
      const s = data.slice(Math.max(0, i - 4), i + 1);
      return s.reduce((a, b) => a + b, 0) / s.length;
    });
    const gold = cssVar("--gold"), accent = cssVar("--accent"), muted = cssVar("--muted"), line = cssVar("--line");
    const ds = {
      labels,
      datasets: [
        { label: "Placement", data, showLine: false, pointRadius: data.map((p) => (p === 1 ? 6 : 4)), pointBackgroundColor: data.map((p) => (p === 1 ? gold : accent)), pointBorderWidth: 0 },
        { label: "5-game average", data: avg, borderColor: muted, borderWidth: 2, pointRadius: 0, tension: 0.3, borderDash: [4, 4] },
      ],
    };
    const opts = {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { labels: { color: muted, boxWidth: 12 } },
        tooltip: { callbacks: { label: (c) => (c.datasetIndex === 0 ? `#${c.raw} · ${chrono[c.dataIndex].mode}` : `Avg #${c.raw.toFixed(1)}`) } },
      },
      scales: {
        y: { reverse: true, min: 1, suggestedMax: Math.min(100, Math.max(25, ...data) ), ticks: { color: muted, callback: (v) => "#" + v }, grid: { color: line } },
        x: { ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
      },
    };
    if (chart) chart.destroy();
    chart = new Chart($("#placement-chart"), { type: "line", data: ds, options: opts });
  }

  function renderElimBars(list) {
    const losses = list.filter((m) => m.placement !== 1);
    if (!losses.length) { $("#elim-bars").innerHTML = `<p class="empty">No losses in this range. Keep it up.</p>`; return; }
    const counts = {};
    losses.forEach((m) => { const k = m.elim_cause || "Not logged"; counts[k] = (counts[k] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    $("#elim-bars").innerHTML = rows.map(([k, v], i) => `
      <div class="bar-row${i === 0 ? " top" : ""}">
        <div class="bar-label"><span>${esc(k)}</span><b>${v} · ${pct(v / losses.length)}</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div>
      </div>`).join("");
  }

  function renderPlayerTable(list) {
    const agg = {};
    list.forEach((m) => (m.match_stats || []).forEach((s) => {
      const a = agg[s.player_id] || (agg[s.player_id] = { games: 0, kills: 0, dmg: 0, ast: 0, wins: 0, best: 0 });
      a.games++; a.kills += s.kills; a.dmg += s.damage; a.ast += s.assists;
      if (m.placement === 1) a.wins++;
      a.best = Math.max(a.best, s.kills);
    }));
    const rows = Object.entries(agg).map(([id, a]) => ({ id, ...a, kpg: a.kills / a.games, dpg: a.dmg / a.games, apg: a.ast / a.games }))
      .sort((x, y) => y.dpg - x.dpg);
    const topK = Math.max(...rows.map((r) => r.kpg));
    const topD = Math.max(...rows.map((r) => r.dpg));
    $("#player-table").innerHTML = `
      <thead><tr><th>Player</th><th>Games</th><th>Kills/game</th><th>Damage/game</th><th>Assists/game</th><th>Total kills</th><th>Best game</th><th>Wins</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td class="name">${esc(playerName(r.id))}</td>
          <td>${r.games}</td>
          <td class="${r.kpg === topK && rows.length > 1 ? "lead" : ""}">${fmt1(r.kpg)}</td>
          <td class="${r.dpg === topD && rows.length > 1 ? "lead" : ""}">${Math.round(r.dpg)}</td>
          <td>${fmt1(r.apg)}</td>
          <td>${r.kills}</td>
          <td>${r.best} kills</td>
          <td>${r.wins}</td>
        </tr>`).join("")}</tbody>`;
  }

  function renderDropTable(list) {
    const agg = {};
    list.forEach((m) => {
      const k = (m.drop_spot || "").trim() || "Not logged";
      const a = agg[k] || (agg[k] = { games: 0, place: 0, wins: 0, early: 0, kills: 0 });
      a.games++; a.place += m.placement;
      if (m.placement === 1) a.wins++;
      if (m.elim_cause === "Hot drop fight") a.early++;
      a.kills += (m.match_stats || []).reduce((s, x) => s + x.kills, 0);
    });
    const rows = Object.entries(agg).map(([k, a]) => ({ k, ...a, avg: a.place / a.games }))
      .sort((x, y) => y.games - x.games || x.avg - y.avg);
    const overallAvg = list.reduce((s, m) => s + m.placement, 0) / list.length;
    $("#drop-table").innerHTML = `
      <thead><tr><th>Drop spot</th><th>Games</th><th>Avg placement</th><th>Win rate</th><th>Died early</th><th>Kills/game</th><th></th></tr></thead>
      <tbody>${rows.map((r) => {
        let chip = "";
        if (r.games >= 3) {
          if (r.avg <= overallAvg - 3 || r.wins / r.games >= 0.2) chip = `<span class="chip good">Strong</span>`;
          else if (r.early / r.games >= 0.4 || r.avg >= overallAvg + 5) chip = `<span class="chip bad">Risky</span>`;
        } else chip = `<span class="chip">Few games</span>`;
        return `<tr>
          <td class="name">${esc(r.k)}</td>
          <td>${r.games}</td>
          <td>#${fmt1(r.avg)}</td>
          <td>${pct(r.wins / r.games)}</td>
          <td>${pct(r.early / r.games)}</td>
          <td>${fmt1(r.kills / r.games)}</td>
          <td>${chip}</td>
        </tr>`;
      }).join("")}</tbody>`;
  }

  // ---------- History ----------
  function renderHistory() {
    const el = $("#history-list");
    if (!state.matches.length) {
      el.innerHTML = `<div class="card empty-card"><h2 class="h2">No matches yet</h2><p>Your logged games will show up here.</p></div>`;
      return;
    }
    el.innerHTML = state.matches.map((m) => {
      const when = new Date(m.played_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const players = (m.match_stats || []).map((s) => `<b>${esc(playerName(s.player_id))}</b> ${s.kills}k / ${s.damage} dmg`).join(" · ");
      return `
        <article class="match${m.placement === 1 ? " win" : ""}">
          <div class="place">#${m.placement}<small>${m.placement === 1 ? "Win" : "Place"}</small></div>
          <div class="match-main">
            <div class="match-line">${esc(m.mode)}${m.drop_spot ? " · " + esc(m.drop_spot) : ""}${m.placement !== 1 && m.elim_cause ? " · " + esc(m.elim_cause) : ""}</div>
            <div class="match-meta">${when}</div>
            ${players ? `<div class="match-players">${players}</div>` : ""}
            ${m.notes ? `<div class="match-notes">${esc(m.notes)}</div>` : ""}
          </div>
          <button class="btn btn-small btn-danger" data-del="${m.id}">Delete</button>
        </article>`;
    }).join("");
  }

  $("#history-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    if (!btn.classList.contains("is-armed")) {
      btn.classList.add("is-armed"); btn.textContent = "Tap again to delete";
      setTimeout(() => { btn.classList.remove("is-armed"); btn.textContent = "Delete"; }, 3000);
      return;
    }
    btn.disabled = true; btn.textContent = "Deleting…";
    const r = await db.from("matches").delete().eq("id", btn.dataset.del);
    if (r.error) { btn.textContent = "Couldn't delete"; return; }
    await loadAll();
    renderHistory();
    renderDropList();
  });

  // ---------- Squad ----------
  function renderSquad() {
    const el = $("#squad-list");
    if (!state.players.length) { el.innerHTML = `<p class="empty">No one yet. Add your first squad member above.</p>`; return; }
    el.innerHTML = state.players.map((p) => `
      <div class="squad-row${p.active ? "" : " benched"}">
        <span class="tag">${esc(p.gamertag)}</span>
        ${p.active ? "" : `<span class="chip">Benched</span>`}
        <button class="btn btn-small" data-rename="${p.id}">Rename</button>
        <button class="btn btn-small" data-toggle="${p.id}">${p.active ? "Bench" : "Activate"}</button>
      </div>`).join("");
  }

  $("#add-player").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#new-tag");
    const tag = input.value.trim();
    if (!tag) return;
    const r = await db.from("players").insert({ gamertag: tag });
    if (r.error) { showBanner(/duplicate|unique/i.test(r.error.message) ? `${esc(tag)} is already on the squad.` : "Couldn't add player: " + esc(r.error.message)); return; }
    $("#banner").hidden = true;
    input.value = "";
    await loadAll();
    renderSquad(); renderFormPlayers();
  });

  $("#squad-list").addEventListener("click", async (e) => {
    const t = e.target.closest("[data-toggle]");
    const rn = e.target.closest("[data-rename]");
    if (t) {
      const p = state.players.find((x) => x.id === t.dataset.toggle);
      await db.from("players").update({ active: !p.active }).eq("id", p.id);
      await loadAll(); renderSquad(); renderFormPlayers();
    }
    if (rn) {
      const row = rn.closest(".squad-row");
      const p = state.players.find((x) => x.id === rn.dataset.rename);
      row.innerHTML = `
        <input type="text" class="rename-input" value="${esc(p.gamertag)}" aria-label="New gamertag" style="flex:1;min-width:140px">
        <button class="btn btn-small btn-primary" data-save="${p.id}">Save</button>
        <button class="btn btn-small" data-cancel>Cancel</button>`;
      row.querySelector("input").focus();
    }
    const save = e.target.closest("[data-save]");
    if (save) {
      const val = save.parentElement.querySelector("input").value.trim();
      if (val) await db.from("players").update({ gamertag: val }).eq("id", save.dataset.save);
      await loadAll(); renderSquad(); renderFormPlayers();
    }
    if (e.target.closest("[data-cancel]")) renderSquad();
  });

  // ---------- Boot ----------
  (async function boot() {
    state.range = store.get("range", "session");
    $$("#range-seg button").forEach((x) => x.classList.toggle("is-active", x.dataset.range === state.range));
    const ok = await loadAll();
    setupForm();
    const hash = (location.hash || "").replace("#", "");
    const start = ["log", "dash", "history", "squad"].includes(hash) ? hash : (ok && !state.players.length ? "squad" : "log");
    showTab(start);
  })();
})();
