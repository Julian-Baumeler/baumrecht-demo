const D = window.BAUMRECHT;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const STORE = "baumrecht-demo-v1";

const state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    ordinanceText: D.ordinance.text,
    approvedParams: parseParams(D.ordinance.text),
    version: 1,
    versions: [{ n: 1, at: new Date().toISOString(), params: parseParams(D.ordinance.text), note: "Startfassung (simuliert)" }],
    proposals: [],
    changelog: [{ at: new Date().toISOString(), type: "seed", note: "Demo geladen" }],
  };
}
function save() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

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
  if (key.endsWith("_m")) return val + " m";
  if (key.endsWith("_cm")) return val + " cm";
  if (key === "replacement_ratio") return val === 1 ? "1:1" : val + ":1";
  if (key === "felling_permit_required") return val ? "ja" : "nein";
  if (key === "fine_max_eur") return val + " €";
  return String(val);
}

function paramDiff(a, b) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  const out = [];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k]) && (a[k] != null || b[k] != null)) {
      out.push({ key: k, from: a[k], to: b[k] });
    }
  }
  return out;
}

function hashText(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return String(h);
}

/* views */
$$("nav button").forEach((b) => {
  b.onclick = () => show(b.dataset.view);
});
function show(name) {
  $$("nav button").forEach((x) => x.classList.toggle("on", x.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === "view-" + name));
  if (name === "queue") renderQueue();
  if (name === "sources") renderSources();
  if (name === "versions") renderVersions();
  if (name === "demo") renderDemo();
}

$("#banner").textContent = D.banner;

/* search */
$("#quick").innerHTML = ["Zürich", "Wien", "München", "Berlin", "Musterhausen"]
  .map((n) => `<button type="button">${n}</button>`)
  .join("");
$$("#quick button").forEach((b) => (b.onclick = () => loadPack(b.textContent)));

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z]/g, "");
}
function searchPlaces(q) {
  const n = norm(q);
  if (n.length < 2) return [];
  return D.places.filter((p) => norm(p.name).includes(n) || (p.slug && p.slug.includes(n)));
}
$("#q").addEventListener("input", () => {
  const hits = searchPlaces($("#q").value);
  $("#suggest").innerHTML = hits
    .map((h) => `<button data-name="${h.name}">${h.name} <span class="meta">${h.country}-${h.region}</span></button>`)
    .join("");
  $$("#suggest button").forEach((b) => (b.onclick = () => loadPack(b.dataset.name)));
});
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const first = $("#suggest button");
    if (first) loadPack(first.dataset.name);
  }
});

function placeSlug(name) {
  const p = D.places.find((x) => x.name === name) || D.places.find((x) => norm(x.name) === norm(name));
  return p && p.slug;
}

function loadPack(name) {
  $("#q").value = name;
  $("#suggest").innerHTML = "";
  const slug = placeSlug(name);
  const pack = slug && D.packs[slug];
  const el = $("#pack");
  if (!pack) {
    el.innerHTML = `<p class="empty">${name} ist auf der Karte, hat in dieser Demo aber noch kein Pack. Nimm Zürich, Wien, München, Berlin oder Musterhausen.</p>`;
    return;
  }
  if (slug === "musterhausen") applyMusterhausenOverlay(pack);
  const headlines = [];
  const seen = new Set();
  for (const l of pack.stack) {
    for (const h of l.headlines || []) {
      if (!seen.has(h.key)) {
        seen.add(h.key);
        headlines.push(h);
      }
    }
  }
  const json = JSON.stringify(pack, null, 2);
  const blob = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  el.innerHTML = `
    <div class="card">
      <a class="json-dl btn" href="${blob}" download="${slug}.pack.json">JSON-Pack</a>
      <div class="layer">${pack.place.country} · ${pack.place.region}</div>
      <h3>${pack.place.name}</h3>
      <p class="meta">${pack.stack.filter((s) => s.has_extract).length} Extrakte · Showcase-Daten, nicht live gezogen</p>
      <div class="chips">${headlines.map((h) => `<span class="chip">${h.key.replaceAll("_", " ")}: <b>${h.value}${h.unit ? " " + h.unit : ""}</b></span>`).join("")}</div>
    </div>
    <div class="stack" style="margin-top:16px">${pack.stack.map(layerCard).join("")}</div>`;
}

function applyMusterhausenOverlay(pack) {
  const layer = pack.stack.find((l) => l.source.id === "demo-musterhausen-baumschutz");
  if (!layer || !layer.extract) return;
  const p = state.approvedParams;
  const set = (key, value, unit) => {
    for (const r of layer.extract.rules) {
      for (const x of r.parameters) {
        if (x.key === key && value != null) {
          x.value = value;
          x.unit = unit || x.unit;
        }
      }
    }
    const h = (layer.headlines || []).find((x) => x.key === key);
    if (h && value != null) h.value = value;
  };
  set("stem_circumference_threshold_cm", p.stem_circumference_threshold_cm, "cm");
  set("protection_zone_drip_line_offset_m", p.protection_zone_drip_line_offset_m, "m");
  set("fence_min_height_m", p.fence_min_height_m, "m");
  set("replacement_ratio", p.replacement_ratio);
  layer.extract.version = state.version;
}

function layerCard(layer) {
  const s = layer.source;
  const j = s.jurisdiction || {};
  const ex = layer.extract;
  if (!ex) {
    return `<div class="card"><div class="layer">${j.level || ""} · Katalog</div><h3>${s.title}</h3>
      <p class="meta">${s.paywalled ? "Paywalled — nur zitiert" : "In dieser Demo nicht extrahiert"}</p></div>`;
  }
  const rules = (ex.rules || [])
    .map(
      (r) => `<div class="rule"><strong>${r.title || r.id}</strong>
        <span class="meta"> · ${r.legal_locator || ""}</span>
        <div class="chips">${(r.parameters || []).map((p) => `<span class="chip">${p.key.replaceAll("_", " ")}: <b>${p.value}${p.unit ? " " + p.unit : ""}</b></span>`).join("")}</div>
        ${(r.parameters || []).filter((p) => p.raw_quote).slice(0, 1).map((p) => `<p class="quote">«${p.raw_quote}»</p>`).join("")}
      </div>`
    )
    .join("");
  return `<div class="card">
    <div class="layer">${j.level || ""} · ${s.type || ""}</div>
    <h3>${s.title}</h3>
    <p class="meta">v${ex.version || 1}</p>
    <div class="chips">${(layer.headlines || []).map((h) => `<span class="chip">${h.key.replaceAll("_", " ")}: <b>${h.value}${h.unit ? " " + h.unit : ""}</b></span>`).join("")}</div>
    <div class="rules">${rules}</div>
  </div>`;
}

function initMap() {
  const map = L.map("map", { scrollWheelZoom: false }).setView([48.2, 11.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OSM" }).addTo(map);
  D.places.forEach((p) => {
    if (p.lat == null) return;
    const has = !!D.packs[p.slug];
    const m = L.circleMarker([p.lat, p.lon], {
      radius: p.demo || p.slug === "musterhausen" ? 8 : 6,
      color: p.slug === "musterhausen" ? "#b5683a" : has ? "#2f5d45" : "#8aa090",
      fillOpacity: 0.85,
    }).addTo(map);
    m.bindTooltip(p.name);
    m.on("click", () => loadPack(p.name));
  });
}

function renderDemo() {
  $("#ordinance").value = state.ordinanceText;
  $("#ord-meta").textContent = `Aktuell genehmigt: v${state.version} · Hash ${hashText(state.ordinanceText)}`;
}
$("#ordinance") && null;
document.addEventListener("input", (e) => {
  if (e.target.id === "ordinance") {
    state.ordinanceText = e.target.value;
    save();
  }
});
$("#btn-novelle").onclick = () => {
  $("#ordinance").value = D.scriptedNovelle.text;
  state.ordinanceText = D.scriptedNovelle.text;
  save();
  renderDemo();
  $("#update-status").textContent = "Novelle im Editor. Jetzt «Aktualisieren».";
};
$("#btn-reset").onclick = () => {
  localStorage.removeItem(STORE);
  location.reload();
};

function renderQueue() {
  $("#badge-queue").textContent = state.proposals.length;
  const box = $("#queue");
  if (!state.proposals.length) {
    box.innerHTML = `<p class="empty">Keine offenen Vorschläge. In der Demo-Verordnung Zahlen ändern (oder Novelle einspielen) und Aktualisieren.</p>`;
    return;
  }
  box.innerHTML = state.proposals
    .map((p, i) => {
      const diffs = (p.diff || [])
        .map((d) => `<div class="diff-row"><div class="from">${d.key.replaceAll("_", " ")}: ${fmt(d.key, d.from)}</div><div class="to">${fmt(d.key, d.to)}</div></div>`)
        .join("");
      return `<div class="card">
        <div class="layer">Simulierter Vorschlag · ${p.source_id}</div>
        <h3>${p.title}</h3>
        <p>${p.summary}</p>
        ${diffs}
        <p class="meta">${p.bim}</p>
        <div class="actions">
          <button class="btn ok" data-approve="${i}">Freigeben</button>
          <button class="btn bad" data-reject="${i}">Ablehnen</button>
        </div>
      </div>`;
    })
    .join("");
  $$("[data-approve]").forEach((b) => (b.onclick = () => approve(+b.dataset.approve)));
  $$("[data-reject]").forEach((b) => (b.onclick = () => reject(+b.dataset.reject)));
}

function approve(i) {
  const p = state.proposals[i];
  if (!p) return;
  state.version += 1;
  state.approvedParams = p.params;
  state.versions.push({ n: state.version, at: new Date().toISOString(), params: p.params, note: p.summary });
  state.changelog.unshift({ at: new Date().toISOString(), type: "approve", note: `v${state.version} Musterhausen` });
  state.proposals.splice(i, 1);
  save();
  renderQueue();
  $("#update-status").textContent = `v${state.version} ist current. Ort Musterhausen neu laden.`;
}

function reject(i) {
  const p = state.proposals[i];
  state.changelog.unshift({ at: new Date().toISOString(), type: "reject", note: p && p.title });
  state.proposals.splice(i, 1);
  save();
  renderQueue();
}

function renderSources() {
  const country = $("#f-country").value;
  const q = ($("#f-q").value || "").toLowerCase();
  const rows = D.sources.filter((s) => {
    if (country && s.country !== country) return false;
    if (q && !(s.title || "").toLowerCase().includes(q) && !s.id.includes(q)) return false;
    return true;
  });
  $("#sources").innerHTML = `<p class="meta">${rows.length} Katalogeinträge (statisch)</p>
    <table><thead><tr><th>ID</th><th>Titel</th><th>Land</th><th>Ebene</th><th>Status</th><th>Extrakt</th></tr></thead>
    <tbody>${rows
      .map(
        (s) => `<tr><td><code>${s.id}</code></td><td>${s.title}</td><td>${s.country || ""}</td>
        <td>${s.level || ""}</td><td>${s.status}</td><td>${s.has_extract ? "ja" : "—"}</td></tr>`
      )
      .join("")}</tbody></table>`;
}
["f-country", "f-q"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", renderSources);
  if (el && el.tagName === "SELECT") el.addEventListener("change", renderSources);
});

function renderVersions() {
  const rows = [...state.versions].reverse();
  $("#changelog").innerHTML = rows
    .map((v) => {
      const prev = state.versions.find((x) => x.n === v.n - 1);
      const diffs = prev
        ? paramDiff(prev.params, v.params)
            .map((d) => `<div class="diff-row"><div class="from">${fmt(d.key, d.from)}</div><div class="to">${fmt(d.key, d.to)}</div></div>`)
            .join("")
        : "";
      return `<div class="card"><div class="layer">v${v.n}</div><h3>${v.note || ""}</h3>
        <p class="meta">${v.at}</p>${diffs}</div>`;
    })
    .join("");
}

const FAKE_SCAN = [
  "CH NHG",
  "VSSG Merkblatt",
  "Zürich BZO Baumerhalt",
  "BNatSchG § 39",
  "München BaumschutzV",
  "Berlin BaumSchVO",
  "Wien Baumschutzgesetz",
  "Musterhausen (Demo)",
];

async function runUpdate() {
  const st = $("#update-status");
  st.innerHTML = `<div class="progress"><i></i></div>Simulation startet…`;
  const bar = st.querySelector("i");
  for (let i = 0; i < FAKE_SCAN.length; i++) {
    await new Promise((r) => setTimeout(r, 180 + Math.random() * 120));
    bar.style.width = ((i + 1) / FAKE_SCAN.length) * 100 + "%";
    st.lastChild && (st.childNodes[1].textContent = "");
    st.append(` ${i + 1}/${FAKE_SCAN.length} · ${FAKE_SCAN[i]}`);
    st.innerHTML = `<div class="progress"><i style="width:${((i + 1) / FAKE_SCAN.length) * 100}%"></i></div>${i + 1}/${FAKE_SCAN.length} · ${FAKE_SCAN[i]}`;
  }
  const next = parseParams(state.ordinanceText);
  const diff = paramDiff(state.approvedParams, next);
  if (!diff.length) {
    st.textContent = "Fertig. Keine Änderung gegenüber der genehmigten Fassung.";
    state.changelog.unshift({ at: new Date().toISOString(), type: "update", note: "keine Änderung" });
    save();
    return;
  }
  const summary = diff.map((d) => `${d.key.replaceAll("_", " ")}: ${fmt(d.key, d.from)} → ${fmt(d.key, d.to)}`).join("; ");
  const bim =
    "BimTree/REGISA: " +
    diff
      .map((d) => {
        if (d.key === "protection_zone_drip_line_offset_m") return `Clash-Radius = Kronentraufe + ${d.to} m`;
        if (d.key === "stem_circumference_threshold_cm") return `Permit-Flag ab ${d.to} cm Stammumfang`;
        if (d.key === "fence_min_height_m") return `Schutzzaun mind. ${d.to} m`;
        if (d.key === "replacement_ratio") return `Ersatz ${fmt(d.key, d.to)}`;
        return `${d.key} anpassen`;
      })
      .join("; ") +
    ".";
  state.proposals = [
    {
      source_id: "demo-musterhausen-baumschutz",
      title: "Musterhausen — simulierte Novelle",
      summary,
      bim,
      diff,
      params: next,
    },
  ];
  state.changelog.unshift({ at: new Date().toISOString(), type: "proposal", note: summary });
  save();
  $("#badge-queue").textContent = "1";
  st.textContent = "Änderung erkannt. Vorschlag liegt unter Prüfen.";
  show("queue");
}

$("#btn-update").onclick = runUpdate;
$("#badge-queue").textContent = state.proposals.length;

initMap();
loadPack("Zürich");
renderDemo();
