const D = window.BAUMRECHT;
const STORE = "baumrecht-demo-v3";
const STEPS = [
  { id: 1, label: "1 · Idee" },
  { id: 2, label: "2 · JSON heute" },
  { id: 3, label: "3 · Text ändert" },
  { id: 4, label: "4 · Prüfen" },
  { id: 5, label: "5 · JSON danach" },
];

const $app = document.getElementById("app");

function parseParams(text) {
  const t = text.replace(/\u00a0/g, " ");
  const n = (re) => {
    const m = t.match(re);
    if (!m) return null;
    const v = Number(String(m[1]).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(v) ? v : null;
  };
  const ratio = t.match(/Verhältnis\s+(\d+)\s*:\s*(\d+)/i);
  return {
    stem_circumference_threshold_cm: n(/Stammumfang von\s+([\d.,]+)\s*cm/),
    measure_height_m: n(/gemessen in\s+([\d.,]+)\s*m/),
    protection_zone_drip_line_offset_m: n(/zuzüglich\s+([\d.,]+)\s*m/),
    columnar_extra_offset_m: n(/Zuschlag\s+([\d.,]+)\s*m/),
    fence_min_height_m: n(/Zaun von mindestens\s+([\d.,]+)\s*m/),
    excavation_min_distance_m: n(/Vierfache[\s\S]{0,160}?mindestens\s+([\d.,]+)\s*m/),
    excavation_distance_stem_circumference_factor: /Vierfache/i.test(t) ? 4 : null,
    replacement_ratio: ratio ? Number(ratio[1]) / Number(ratio[2] || 1) : null,
    felling_permit_required: /Genehmigung/.test(t),
    fine_max_eur: n(/bis zu\s+([\d ]+)\s*Euro/),
  };
}

function fmt(key, val) {
  if (val == null || val === "") return "—";
  if (key.endsWith("_m")) return String(val).replace(".", ",") + " m";
  if (key.endsWith("_cm")) return val + " cm";
  if (key === "replacement_ratio") return val === 1 ? "1:1" : val + ":1";
  if (key === "felling_permit_required") return val ? "ja" : "nein";
  if (key === "fine_max_eur") return val + " €";
  return String(val);
}

function paramDiff(a, b) {
  return Object.keys({ ...a, ...b })
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && (a[k] != null || b[k] != null))
    .map((k) => ({ key: k, from: a[k], to: b[k] }));
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitLines(t) {
  return String(t || "").replace(/\r\n/g, "\n").split("\n");
}

function lineOps(oldT, newT) {
  const a = splitLines(oldT);
  const b = splitLines(newT);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "eq", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "del", text: a[i++] });
    } else {
      ops.push({ op: "add", text: b[j++] });
    }
  }
  while (i < n) ops.push({ op: "del", text: a[i++] });
  while (j < m) ops.push({ op: "add", text: b[j++] });
  return ops;
}

function inlineMarkup(oldLine, newLine) {
  const tok = (s) => s.split(/(\s+)/).filter((x) => x !== "");
  const a = tok(oldLine);
  const b = tok(newLine);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const del = [];
  const add = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      del.push(esc(a[i]));
      add.push(esc(b[j]));
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      del.push(`<mark class="tok-del">${esc(a[i++])}</mark>`);
    } else {
      add.push(`<mark class="tok-add">${esc(b[j++])}</mark>`);
    }
  }
  while (i < n) del.push(`<mark class="tok-del">${esc(a[i++])}</mark>`);
  while (j < m) add.push(`<mark class="tok-add">${esc(b[j++])}</mark>`);
  return { del: del.join(""), add: add.join("") };
}

function renderCodediff(oldT, newT) {
  const ops = lineOps(oldT, newT);
  const rows = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.op === "eq") {
      if ((ops[i - 1] && ops[i - 1].op !== "eq") || (ops[i + 1] && ops[i + 1].op !== "eq")) {
        rows.push(`<div class="diff-ctx">  ${esc(o.text)}</div>`);
      }
      continue;
    }
    if (o.op === "del" && ops[i + 1] && ops[i + 1].op === "add") {
      const mark = inlineMarkup(o.text, ops[i + 1].text);
      rows.push(`<div class="diff-del">- ${mark.del}</div>`);
      rows.push(`<div class="diff-add">+ ${mark.add}</div>`);
      i++;
      continue;
    }
    if (o.op === "del") rows.push(`<div class="diff-del">- ${esc(o.text)}</div>`);
    if (o.op === "add") rows.push(`<div class="diff-add">+ ${esc(o.text)}</div>`);
  }
  if (!rows.length) return `<p class="meta">Keine Textänderung.</p>`;
  return `<div class="codediff">${rows.join("")}</div>`;
}

function snippetForParam(oldT, newT, key, from, to) {
  const needle = (v) => fmt(key, v);
  const oldLine = splitLines(oldT).find((ln) => ln.includes(needle(from)) || (from != null && ln.includes(String(from).replace(".", ","))));
  const newLine = splitLines(newT).find((ln) => ln.includes(needle(to)) || (to != null && ln.includes(String(to).replace(".", ","))));
  if (oldLine && newLine && oldLine !== newLine) {
    const mark = inlineMarkup(oldLine, newLine);
    return `<div class="codediff"><div class="diff-del">- ${mark.del}</div><div class="diff-add">+ ${mark.add}</div></div>`;
  }
  return "";
}

function exportPack(params, version) {
  return {
    place: { name: "Musterhausen", country: "DE", region: "BY" },
    version,
    source: "Gemeinde Musterhausen — Baumschutzverordnung (Demo)",
    parameters: {
      stem_circumference_threshold_cm: params.stem_circumference_threshold_cm,
      measure_height_m: params.measure_height_m,
      protection_zone_drip_line_offset_m: params.protection_zone_drip_line_offset_m,
      columnar_extra_offset_m: params.columnar_extra_offset_m,
      fence_min_height_m: params.fence_min_height_m,
      excavation_min_distance_m: params.excavation_min_distance_m,
      excavation_distance_stem_circumference_factor: params.excavation_distance_stem_circumference_factor,
      replacement_ratio: params.replacement_ratio,
      felling_permit_required: params.felling_permit_required,
      fine_max_eur: params.fine_max_eur,
    },
    bim: {
      clashOffsetFromCrown_m: params.protection_zone_drip_line_offset_m,
      permitFromStemCircumference_cm: params.stem_circumference_threshold_cm,
      fenceHeight_m: params.fence_min_height_m,
      replacementRatio: params.replacement_ratio,
    },
  };
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function chips(params) {
  const keys = [
    "stem_circumference_threshold_cm",
    "protection_zone_drip_line_offset_m",
    "fence_min_height_m",
    "replacement_ratio",
  ];
  const labels = {
    stem_circumference_threshold_cm: "Fällschwelle",
    protection_zone_drip_line_offset_m: "Schutzabstand",
    fence_min_height_m: "Zaun",
    replacement_ratio: "Ersatz",
  };
  return keys
    .map((k) => `<span class="chip">${labels[k]}: <b>${fmt(k, params[k])}</b></span>`)
    .join("");
}

function load() {
  const v1 = parseParams(D.ordinance.text);
  const fresh = {
    step: 1,
    lawChanged: false,
    approved: false,
    scanning: false,
    v1,
    v2: null,
    oldText: D.ordinance.text,
    newText: D.ordinance.text,
  };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    return s && s.step ? s : fresh;
  } catch {
    return fresh;
  }
}

const state = load();
function save() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

function go(step) {
  state.step = step;
  save();
  render();
}

function highlightLaw(text, changed) {
  if (!changed) return esc(text);
  return esc(text)
    .replace("70 cm", '<span class="hl">70 cm</span>')
    .replace("2,0 m", '<span class="hl">2,0 m</span>')
    .replace("2,5 m Höhe", '<span class="hl">2,5 m</span> Höhe')
    .replace("2:1", '<span class="hl">2:1</span>');
}

function renderSteps() {
  document.getElementById("steps").innerHTML = STEPS.map(
    (s) => `<li class="${s.id === state.step ? "on" : s.id < state.step ? "done" : ""}">${s.label}</li>`
  ).join("");
}

function render() {
  renderSteps();
  if (mapRef) {
    mapRef.remove();
    mapRef = null;
  }
  const html = ({ 1: step1, 2: step2, 3: step3, 4: step4, 5: step5 }[state.step] || step1)();
  $app.innerHTML = html;
  bind();
}

function step1() {
  const st = D.stats || {};
  return `
    <h1>Aus Gesetzestext werden Zahlen für BIM.</h1>
    <p class="lead">BimParts braucht Parameter (Fällschwelle, Schutzradius, Ersatzquote). Die stehen heute in PDFs über DE, CH und AT. Unten der Katalog, den wir schon gesammelt haben — danach der Ablauf an einem Demo-Ort.</p>
    <div class="stats">
      <span><b>${st.sources || 0}</b> Quellen</span>
      <span><b>${st.DE || 0}</b> DE</span>
      <span><b>${st.CH || 0}</b> CH</span>
      <span><b>${st.AT || 0}</b> AT</span>
      <span><b>${st.active || 0}</b> öffentlich</span>
      <span><b>${st.paywalled || 0}</b> Paywall-Normen</span>
    </div>
    <div class="cities">
      <div class="city"><b>Zürich</b>Fällung ab 100 cm</div>
      <div class="city"><b>Wien</b>Fällung ab 40 cm</div>
      <div class="city"><b>München</b>Fällung ab 60 cm</div>
      <div class="city"><b>Musterhausen</b>Demo-Ort, du änderst ihn</div>
    </div>
    <div id="map"></div>
    <p class="hint">Punkte = erfasste Orte und Regionen. Blau gefüllt = fertiges JSON-Pack in dieser Demo.</p>
    <div class="card">
      <h2>Quellenkatalog</h2>
      <p class="meta">Gesammelt, nicht live abgefragt. Filter ändert nur die Tabelle.</p>
      <div class="filters" id="src-filters">
        <button type="button" data-cc="all" class="on">Alle</button>
        <button type="button" data-cc="DE">DE</button>
        <button type="button" data-cc="CH">CH</button>
        <button type="button" data-cc="AT">AT</button>
      </div>
      <div id="src-table"></div>
    </div>
    <div class="nav">
      <button class="btn primary" data-go="2">Weiter: JSON von heute ansehen</button>
    </div>`;
}

function step2() {
  const json = pretty(exportPack(state.v1, 1));
  return `
    <h1>So sieht das JSON heute aus.</h1>
    <p class="lead">Musterhausen, Version 1. Das wäre der Export, den BimTree / REGISA einlesen könnte. Merke dir die vier Zahlen.</p>
    <div class="row">${chips(state.v1)}</div>
    <div class="card">
      <div class="json-head"><h2>musterhausen.v1.json</h2>
        <a class="btn secondary" id="dl-v1" href="#">Download</a></div>
      <pre class="json-pane">${esc(json)}</pre>
    </div>
    <p class="hint">Als Nächstes ändern wir die Verordnung. Dann vergleichen wir genau dieses JSON mit der neuen Fassung — rot / grün.</p>
    <div class="nav">
      <button class="btn secondary" data-go="1">Zurück</button>
      <button class="btn primary" data-go="3">2 · Verordnung ändern</button>
    </div>`;
}

function step3() {
  const text = state.lawChanged ? D.scriptedNovelle.text : D.ordinance.text;
  return `
    <h1>Die Gemeinde ändert vier Zahlen.</h1>
    <p class="lead">${state.lawChanged
      ? "Die Novelle steht im Text (gelb markiert). Als Nächstes simulieren wir den Abgleich — wie «Aktualisieren» in der echten Wissensbasis."
      : "Ein Klick spielt eine Beispiel-Novelle ein. Du musst nichts selbst tippen."}</p>
    <div class="card">
      <p class="meta">Gemeinde Musterhausen — Baumschutzverordnung</p>
      <div class="law">${highlightLaw(text, state.lawChanged)}</div>
    </div>
    ${state.lawChanged ? `<div class="row">${chips(parseParams(text))}</div>` : ""}
    <div class="nav">
      <button class="btn secondary" data-go="2">Zurück</button>
      ${state.lawChanged
        ? `<button class="btn primary" id="btn-scan">3 · Änderungen prüfen</button>`
        : `<button class="btn primary" id="btn-novelle">Diese 4 Zahlen ändern</button>`}
    </div>
    <div id="scan-status"></div>`;
}

function step4() {
  const oldT = state.oldText;
  const newT = state.newText;
  const diff = paramDiff(state.v1, parseParams(newT));
  const params = diff
    .map(
      (d) => `<div class="param-change">
        <div class="diff-row"><div class="from">${esc(d.key.replaceAll("_", " "))}: ${esc(fmt(d.key, d.from))}</div>
        <div class="to">${esc(fmt(d.key, d.to))}</div></div>
        ${snippetForParam(oldT, newT, d.key, d.from, d.to)}
      </div>`
    )
    .join("");
  return `
    <h1>Prüfen, dann freigeben.</h1>
    <p class="lead">Rot ist der alte Text, grün der neue — direkt aus der Verordnung. Nichts wird current, bevor du freigibst.</p>
    <div class="card">
      <p class="meta">Dokument-Diff</p>
      ${renderCodediff(oldT, newT)}
    </div>
    <div class="card">
      <p class="meta">Parameter, die ins JSON wandern</p>
      ${params}
    </div>
    <div class="nav">
      <button class="btn secondary" data-go="3">Zurück</button>
      <button class="btn primary" id="btn-approve">4 · Freigeben und JSON vergleichen</button>
    </div>`;
}

function step5() {
  const before = pretty(exportPack(state.v1, 1));
  const after = pretty(exportPack(state.v2 || parseParams(state.newText), 2));
  return `
    <h1>Das ist der Unterschied im JSON.</h1>
    <p class="lead">Gleicher Export, neue Version. Rot = weg, grün = neu. Das ist die Datei, die BimParts verwenden würde.</p>
    <div class="row">${chips(state.v2 || parseParams(state.newText))}</div>
    <div class="card">
      <div class="json-head">
        <h2>musterhausen.json — v1 → v2</h2>
        <a class="btn secondary" id="dl-v2" href="#">Download v2</a>
      </div>
      ${renderCodediff(before, after)}
    </div>
    <p class="hint">Das ist der ganze Loop: unstrukturierter Text → geprüfte Parameter → versioniertes JSON. In Produktion käme der Text von echten Erlassen; die Prüfung bleibt menschlich.</p>
    <div class="nav">
      <button class="btn secondary" data-go="4">Zurück zur Prüfung</button>
      <button class="btn primary" id="btn-reset-end">Nochmal von vorn</button>
    </div>`;
}

const STATUS_DE = {
  active: "öffentlich",
  paywalled: "Paywall",
  "known-unfetched": "katalogisiert",
  fetch_error: "Fehler",
  demo: "Demo",
};
const LEVEL_DE = {
  country: "Bund",
  state: "Land / Kanton",
  municipality: "Gemeinde",
  standard: "Norm",
  guideline: "Merkblatt",
};

let mapRef = null;
let sourceCountry = "all";

function renderSourceTable() {
  const box = document.getElementById("src-table");
  if (!box) return;
  const rows = (D.sources || []).filter((s) => sourceCountry === "all" || s.country === sourceCountry);
  box.innerHTML = `<p class="meta">${rows.length} Einträge</p>
    <table class="src-table"><thead><tr>
      <th>Land</th><th>Ebene</th><th>Titel</th><th>Status</th>
    </tr></thead><tbody>${rows
      .map((s) => {
        const title = s.url
          ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.id)}</a>`
          : esc(s.title || s.id);
        return `<tr>
          <td>${esc(s.country || "")}${s.region ? " · " + esc(s.region) : ""}</td>
          <td>${esc(LEVEL_DE[s.level] || s.level || "")}</td>
          <td>${title}</td>
          <td class="status-pill">${esc(STATUS_DE[s.status] || s.status || "")}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
}

function initMap() {
  const el = document.getElementById("map");
  if (!el || typeof L === "undefined") return;
  if (mapRef) {
    mapRef.remove();
    mapRef = null;
  }
  mapRef = L.map(el, { scrollWheelZoom: false }).setView([48.9, 10.8], 5);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OSM · CARTO",
  }).addTo(mapRef);
  (D.mapPoints || []).forEach((p) => {
    const filled = p.pack;
    L.circleMarker([p.lat, p.lon], {
      radius: filled ? 8 : p.kind === "city" ? 5 : 4,
      color: "#0060e6",
      weight: filled ? 2 : 1,
      fillColor: filled ? "#0060e6" : "#fff",
      fillOpacity: filled ? 0.9 : 1,
    })
      .addTo(mapRef)
      .bindTooltip(`${p.name} (${p.country})`);
  });
  setTimeout(() => mapRef && mapRef.invalidateSize(), 80);
}

function bind() {
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => go(+b.dataset.go)));
  if (document.getElementById("map")) {
    initMap();
    renderSourceTable();
    document.querySelectorAll("#src-filters button").forEach((b) => {
      b.onclick = () => {
        sourceCountry = b.dataset.cc;
        document.querySelectorAll("#src-filters button").forEach((x) => x.classList.toggle("on", x === b));
        renderSourceTable();
      };
    });
  }
  const nov = document.getElementById("btn-novelle");
  if (nov) {
    nov.onclick = () => {
      state.lawChanged = true;
      state.newText = D.scriptedNovelle.text;
      save();
      render();
    };
  }
  const scan = document.getElementById("btn-scan");
  if (scan) {
    scan.onclick = runScan;
  }
  const ap = document.getElementById("btn-approve");
  if (ap) {
    ap.onclick = () => {
      state.approved = true;
      state.v2 = parseParams(state.newText);
      go(5);
    };
  }
  const r1 = document.getElementById("btn-reset-end");
  if (r1) r1.onclick = reset;
  const dl1 = document.getElementById("dl-v1");
  if (dl1) bindDownload(dl1, exportPack(state.v1, 1), "musterhausen.v1.json");
  const dl2 = document.getElementById("dl-v2");
  if (dl2) bindDownload(dl2, exportPack(state.v2 || parseParams(state.newText), 2), "musterhausen.v2.json");
}

function bindDownload(a, obj, name) {
  const blob = new Blob([pretty(obj)], { type: "application/json" });
  a.href = URL.createObjectURL(blob);
  a.download = name;
}

async function runScan() {
  const box = document.getElementById("scan-status");
  const names = ["Katalog", "Musterhausen v1", "Neuer Text", "Parameter ziehen"];
  box.innerHTML = `<div class="card"><p class="meta">Simulation</p><div class="progress"><i></i></div><p id="scan-line">…</p></div>`;
  const bar = box.querySelector("i");
  const line = document.getElementById("scan-line");
  for (let i = 0; i < names.length; i++) {
    bar.style.width = ((i + 1) / names.length) * 100 + "%";
    line.textContent = `${i + 1}/${names.length} · ${names[i]}`;
    await new Promise((r) => setTimeout(r, 280));
  }
  go(4);
}

function reset() {
  localStorage.removeItem(STORE);
  location.reload();
}

document.getElementById("btn-reset").onclick = reset;
render();
