const state = { catalog: null, selected: null, detail: null, query: "", sourceQuery: "", sourceType: "all", leafFilter: "", visible: 12, map: null, mapSelected: "", mapQuery: "", mapStatus: "all", view: "family", runs: [], runId: "latest", transcript: null, labDefaults: null, labGroups: [], labCurrent: null, labRunId: "", labJobId: "" };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const label = {youtube:"YouTube",workshop:"Workshop",hf_daily:"HF Daily Paper",industry_report:"Industry Report",best_paper:"Best Paper"};
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const mixType = (m = {}) => m.academic && m.industry ? "mixed" : m.academic ? "academic" : m.industry ? "industry" : "other";
const sourceType = (t, name = "") => name.toLowerCase() === "stanford" || ["workshop","best_paper","hf_daily"].includes(t) ? "academic" : ["industry_report","youtube"].includes(t) ? "industry" : "other";
const mixBadges = (m = {}) => `<span class="mix-badges"><span class="mix-badge academic">학술 ${fmt(m.academic)}</span><span class="mix-badge industry">산업 ${fmt(m.industry)}</span></span>`;
const evaluationBadges = (e = {}) => e.status === "evaluated"
  ? `<span class="evaluation-badges"><span class="evaluation-badge">금융 ${e.fin_relevance === 1 ? "관련" : "무관"}</span><span class="evaluation-badge">Vol.1 ${e.overlaps_vol1 ? "중복" : "미중복"}</span></span>`
  : `<span class="evaluation-badges"><span class="evaluation-badge">평가 파일 없음</span></span>`;
const runAPI = (suffix) => state.runId === "latest" ? `/api/${suffix}` : `/api/runs/${encodeURIComponent(state.runId)}/${suffix}`;

function staticDataURL(url) {
  const requested = new URL(url, location.origin);
  if (requested.pathname === "/api/compare") {
    const a = requested.searchParams.get("a");
    const b = requested.searchParams.get("b");
    return `/api/compare/${encodeURIComponent(a)}__${encodeURIComponent(b)}.json`;
  }
  return `${requested.pathname}.json`;
}

async function getJSON(url) {
  const response = await fetch(staticDataURL(url));
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return response.json();
}

async function postJSON(url, payload) {
  const response = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function renderStats() {
  const t = state.catalog.totals;
  const metrics = state.catalog.single_stage
    ? [[t.groups,"최종 기술군"],[t.claims,"연결된 CLAIM"],[t.sources,"서로 다른 자료"]]
    : [[t.groups,"상위 기술군"],[t.leaves,"최종 세부기술"],[t.claims,"연결된 CLAIM"],[t.sources,"서로 다른 자료"]];
  $("stats").innerHTML = metrics.map(([n,name]) => `<div class="stat"><strong>${fmt(n)}</strong><span>${name}</span></div>`).join("");
}

function renderEvidenceLandscape() {
  const rows = [...state.catalog.groups].sort((a,b) =>
    (b.source_mix.academic+b.source_mix.industry) - (a.source_mix.academic+a.source_mix.industry) || a.name.localeCompare(b.name));
  const max = Math.max(1,...rows.flatMap(r => [r.source_mix.academic,r.source_mix.industry]));
  const bar = (n,type) => `<span class="evidence-bar-track"><span class="evidence-bar ${type}" style="width:${(n/max*100).toFixed(1)}%"></span></span><strong>${fmt(n)}</strong>`;
  $("evidence-landscape-chart").innerHTML = `<div class="evidence-legend"><span><i class="legend-swatch academic"></i> 학술</span><span><i class="legend-swatch industry"></i> 산업</span><span>최대값 ${fmt(max)}개 · 공통 척도</span></div>
    <div class="evidence-header"><span>최종 기술군</span><span>학술 자료</span><span>산업 자료</span></div>
    ${rows.map(r => `<div class="evidence-row"><a href="#${esc(r.parent_id)}" data-evidence-parent="${esc(r.parent_id)}" title="이 기술군 보기">${esc(r.name)} <small>${esc(r.parent_id.toUpperCase())}</small></a><div class="evidence-measure">${bar(r.source_mix.academic,"academic")}</div><div class="evidence-measure">${bar(r.source_mix.industry,"industry")}</div></div>`).join("")}
    <p class="note">기술군별 중복 제거한 자료 수. 한 자료가 여러 기술군에 연결될 수 있으며, 자료 수는 중요도·성숙도 점수가 아닙니다.</p>`;
  $("evidence-landscape-chart").querySelectorAll("[data-evidence-parent]").forEach(link => link.addEventListener("click", e => {
    e.preventDefault();
    switchView("family");
    selectGroup(link.dataset.evidenceParent);
    $("main-panel").scrollIntoView({behavior:"smooth",block:"start"});
  }));
}

function filteredGroups() {
  const q = state.query.trim().toLowerCase();
  return state.catalog.groups.filter(g => !q || g.search_text.includes(q));
}

function renderGroups() {
  const groups = filteredGroups();
  $("group-count").textContent = `${groups.length} GROUPS`;
  $("group-list").innerHTML = groups.length ? groups.map(g => `
    <button class="group-item mix-${mixType(g.source_mix)} ${g.parent_id === state.selected ? "active" : ""}" role="option" aria-selected="${g.parent_id === state.selected}" data-id="${esc(g.parent_id)}">
      <span class="item-top"><span>${esc(g.parent_id.toUpperCase())}</span><span class="count-pill">${fmt(g.claim_count)} claims</span></span>
      <span class="item-name">${esc(g.name)}</span>${mixBadges(g.source_mix)}${evaluationBadges(g.evaluation)}
    </button>`).join("") : `<p class="note">검색 결과가 없습니다.</p>`;
  $("group-list").querySelectorAll("button[data-id]").forEach(button => {
    button.addEventListener("click", () => selectGroup(button.dataset.id));
  });
}

function renderLeaf(leaf) {
  return `<article class="leaf-card mix-${mixType(leaf.source_mix)}">
    <div class="leaf-top"><span class="leaf-id">${esc(leaf.leaf_id.toUpperCase())}</span><span class="leaf-n">${fmt(leaf.claim_count)} claims · ${fmt(leaf.raw_name_count)} names</span></div>
    <h4>${esc(leaf.name)}</h4>${mixBadges(leaf.source_mix)}<p>${esc(leaf.definition)}</p>
    <details><summary>배경과 근거 더 보기</summary><div class="leaf-more">
      ${leaf.why_emerging ? `<strong>왜 부상하는가</strong>${esc(leaf.why_emerging)}` : ""}
      ${leaf.evidence_summary ? `<strong>공통 근거</strong>${esc(leaf.evidence_summary)}` : ""}
      ${leaf.core_technologies.length ? `<strong>핵심 구성 기술</strong><div class="tech-tags">${leaf.core_technologies.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      ${leaf.member_names?.length ? `<strong>포함된 원 기술명 (${fmt(leaf.member_names.length)}개)</strong><div class="tech-tags raw-tech-tags">${leaf.member_names.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
    </div></details><button class="leaf-source" type="button" data-leaf="${esc(leaf.leaf_id)}">이 세부기술의 자료 보기 ↗</button>
  </article>`;
}

function renderSource(source) {
  const safeURL = /^https?:\/\//i.test(source.url) ? source.url : "";
  const claims = state.leafFilter ? source.claims.filter(c => c.leaf_id === state.leafFilter) : source.claims;
  const claimCount = state.leafFilter ? claims.length : source.claim_count;
  return `<details class="source-card mix-${sourceType(source.source_type,source.source_name)}">
    <summary><div class="source-meta"><span class="source-type ${sourceType(source.source_type,source.source_name)}">${esc(label[source.source_type] || source.source_type)}</span><span>${esc(source.source_name)}</span><span>·</span><span>${esc(source.date)}</span><span>·</span><span>${fmt(claimCount)} claims</span></div>
      <span class="source-title">${esc(source.title)}</span></summary>
    <div class="source-contents">
      ${safeURL ? `<a href="${esc(safeURL)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>` : `<span class="note">원문 URL 없음</span>`}
      ${claims.map(c => `<div class="claim-row"><strong>${esc(c.name)}</strong><small>${esc(c.leaf_id)}</small>${source.source_type === "workshop" ? `<p><b>기술 배경</b> ${esc(c.background || "한국어 배경 없음")}</p>` : `<p>${esc(c.evidence)}</p>`}</div>`).join("")}
    </div>
  </details>`;
}

function filteredSources() {
  if (!state.detail) return [];
  const q = state.sourceQuery.trim().toLowerCase();
  return state.detail.sources.filter(s => {
    if (state.sourceType !== "all" && s.source_type !== state.sourceType) return false;
    if (state.leafFilter && !s.leaf_ids.includes(state.leafFilter)) return false;
    return !q || `${s.title} ${s.source_name} ${s.claims.map(c => c.name).join(" ")}`.toLowerCase().includes(q);
  });
}

function renderSources() {
  const sources = filteredSources();
  $("source-count").textContent = `${fmt(sources.length)}개 자료${state.leafFilter ? ` · ${state.leafFilter} 필터 적용` : ""} · 출처명/제목/추출 기술명 검색 가능`;
  $("clear-leaf").hidden = !state.leafFilter;
  $("source-list").innerHTML = sources.slice(0, state.visible).map(renderSource).join("") || `<p class="note">조건에 맞는 자료가 없습니다.</p>`;
  const more = $("show-more");
  more.hidden = sources.length <= state.visible;
  if (!more.hidden) more.textContent = `자료 더 보기 (${fmt(sources.length - state.visible)}개 남음)`;
}

function renderDetail() {
  const {group:g, leaves, sources} = state.detail;
  const single = g.single_stage;
  const types = [...new Set(sources.map(s => s.source_type))].sort();
  $("main-panel").innerHTML = `
    <div class="detail-header">
      <div class="detail-kicker">${single ? "FINAL TECHNOLOGY" : "TECHNOLOGY FAMILY"} / ${esc(g.parent_id.toUpperCase())}</div>
      <div class="detail-heading"><h2>${esc(g.name)}</h2><div class="detail-number">${fmt(g.claim_count)} CLAIMS</div></div>
      <p class="definition">${esc(g.definition)}</p>
      <div class="metric-row">${single ? "" : `<span class="metric-chip"><strong>${fmt(g.leaf_count)}</strong> 세부기술</span>`}<span class="metric-chip"><strong>${fmt(g.raw_name_count)}</strong> 원 기술명</span><span class="metric-chip"><strong>${fmt(g.source_count)}</strong> 관련 자료</span>${mixBadges(g.source_mix)}</div>
      <div class="evaluation-panel"><div class="evaluation-title">금융·Vol.1 관련성</div>${g.evaluation?.status === "evaluated" ? `
        <div class="evaluation-facts"><div><span>금융 관련성</span><strong>${g.evaluation.fin_relevance === 1 ? "관련" : "무관"}</strong></div><div><span>Vol.1</span><strong>${g.evaluation.overlaps_vol1 ? "중복" : "미중복"}</strong></div></div>
        ${g.evaluation.overlaps_vol1 && g.evaluation.matched_vol1 ? `<p><b>매칭된 Vol.1 기술군</b> ${esc(g.evaluation.matched_vol1)}</p>` : ""}
        ${g.evaluation.scenario ? `<p><b>${g.evaluation.fin_relevance === 1 ? "금융 활용 시나리오" : "금융 관련성 판단 근거"}</b> ${esc(g.evaluation.scenario)}</p>` : ""}
      ` : `<p class="evaluation-unavailable">이 실행은 평가를 완료했을 수 있지만 결과 파일이 보관되지 않았습니다. Normalize 결과만 확인할 수 있습니다.</p>`}</div>
    </div>
    <div class="section-head"><div><div class="section-kicker">01 / WHY IT MATTERS</div><h3>기술군의 배경과 근거</h3></div></div>
    <div class="summary-box">${g.why_emerging ? `<strong>왜 부상하는가</strong><p>${esc(g.why_emerging)}</p>` : ""}<strong>공통 근거</strong><p>${esc(g.evidence_summary)}</p>${g.core_technologies?.length ? `<div class="related-tech"><h4>핵심 구성 기술</h4><div class="tech-tags">${g.core_technologies.map(t=>`<span>${esc(t)}</span>`).join("")}</div></div>` : ""}${g.member_names?.length ? `<div class="related-tech"><h4>포함된 원 기술명 (${fmt(g.member_names.length)}개)</h4><div class="tech-tags raw-tech-tags">${g.member_names.map(t=>`<span>${esc(t)}</span>`).join("")}</div></div>` : ""}</div>
    ${single ? "" : `<div class="section-head"><div><div class="section-kicker">02 / TECHNOLOGY BRANCHES</div><h3>최종 세부기술</h3></div><span>${fmt(leaves.length)}개 세부 클러스터</span></div><p class="source-mix-note"><span class="legend-swatch academic"></span> 학술(워크숍·논문·Stanford) <span class="legend-swatch industry"></span> 산업(리포트·인터뷰) · 숫자는 서로 다른 자료 수</p><div class="leaf-grid">${leaves.map(renderLeaf).join("")}</div>`}
    <div class="section-head"><div><div class="section-kicker">03 / SOURCE EXPLORER</div><h3>관련 자료와 추출 근거</h3></div><span>원문 링크 →</span></div>
    <div class="source-tools"><input id="source-search" type="search" placeholder="자료 제목·출처·기술명 검색" aria-label="관련 자료 검색"><select id="source-type" aria-label="자료 유형 필터"><option value="all">모든 유형</option>${types.map(t => `<option value="${esc(t)}">${esc(label[t] || t)}</option>`).join("")}</select><button class="clear-filter" id="clear-leaf" type="button" hidden>세부기술 필터 해제</button></div>
    <div class="source-count" id="source-count"></div><div class="source-list" id="source-list"></div><button class="show-more" id="show-more" type="button" hidden>자료 더 보기</button>
    <p class="note">자료 건수는 문서 제목·URL 기준으로 묶은 값입니다. claim 건수는 중요도 점수가 아니며, 일부 수집 날짜는 분석용 기준일로 통일되어 있습니다. AI가 종합한 기술명·설명은 원문과 대조해 검증해 주세요.</p>`;
  $("source-search").addEventListener("input", e => { state.sourceQuery=e.target.value; state.visible=12; renderSources(); });
  $("source-type").addEventListener("change", e => { state.sourceType=e.target.value; state.visible=12; renderSources(); });
  $("clear-leaf").addEventListener("click", () => { state.leafFilter=""; state.visible=12; renderSources(); });
  $("main-panel").querySelectorAll("button[data-leaf]").forEach(button => button.addEventListener("click", () => {
    state.leafFilter = button.dataset.leaf;
    state.visible = 12;
    renderSources();
    $("source-count").scrollIntoView({behavior:"smooth",block:"center"});
  }));
  $("show-more").addEventListener("click", () => { state.visible += 12; renderSources(); });
  renderSources();
}

async function selectGroup(id) {
  if (!id || id === state.selected && state.detail) return;
  state.selected = id;
  state.detail = null;
  state.sourceQuery = "";
  state.sourceType = "all";
  state.leafFilter = "";
  state.visible = 12;
  renderGroups();
  $("main-panel").innerHTML = `<div class="empty-state">기술군 자료를 불러오는 중입니다…</div>`;
  try {
    state.detail = await getJSON(runAPI(`groups/${encodeURIComponent(id)}`));
    if (state.selected !== id) return;
    history.replaceState(null, "", `#${id}`);
    renderDetail();
  } catch (error) {
    $("main-panel").innerHTML = `<div class="empty-state" role="alert">자료를 불러오지 못했습니다: ${esc(error.message)}</div>`;
  }
}

function mapGroups() {
  if (!state.map) return [];
  const q = state.mapQuery.trim().toLowerCase();
  return state.map.groups.filter(g => {
    if (state.mapStatus === "retained" && !g.retained) return false;
    if (state.mapStatus === "excluded" && g.retained) return false;
    return !q || `${g.name} ${g.member_names.join(" ")}`.toLowerCase().includes(q);
  });
}

function renderMapList() {
  const groups = mapGroups().sort((a,b) => b.claim_count - a.claim_count || a.leaf_id.localeCompare(b.leaf_id));
  $("map-list-count").textContent = `${fmt(groups.length)}개 1차 후보 · CLAIMS ↓`;
  $("map-leaf-list").innerHTML = groups.map(g => `<button type="button" data-map-leaf="${esc(g.leaf_id)}" class="mix-${mixType(g.source_mix)} ${g.leaf_id === state.mapSelected ? "active" : ""}">
    <span class="map-list-title">${esc(g.name)}</span><span class="map-list-meta">${esc(g.leaf_id)} · ${fmt(g.claim_count)} claims${state.map.stats.single_stage ? "" : ` · ${g.retained ? "2차 유지" : "2차 제외"}`}</span>${mixBadges(g.source_mix)}</button>`).join("") || `<p class="note">검색 결과가 없습니다.</p>`;
  $("map-leaf-list").querySelectorAll("button[data-map-leaf]").forEach(b => b.addEventListener("click", () => selectMapLeaf(b.dataset.mapLeaf)));
}

function renderMapDetail() {
  const g = state.map.groups.find(x => x.leaf_id === state.mapSelected);
  if (!g) return;
  const links = g.sources.filter(s => /^https?:\/\//i.test(s.url));
  $("map-detail").innerHTML = `<div class="map-detail-head"><div><div class="detail-kicker">${esc(g.leaf_id.toUpperCase())} · ${state.map.stats.single_stage ? "FINAL CLUSTER" : "FIRST-STAGE CLUSTER"}</div><h3>${esc(g.name)}</h3>${mixBadges(g.source_mix)}</div>${state.map.stats.single_stage ? "" : `<span class="status-tag ${g.retained ? "retained" : "excluded"}">${g.retained ? "2차 유지" : "2차 제외"}</span>`}</div>
    ${g.definition ? `<p>${esc(g.definition)}</p>` : `<p class="muted-explain">종합 기술 설명이 없습니다. 포함된 원 기술명과 근거를 확인해 주세요.</p>`}
    <div class="metric-row"><span class="metric-chip"><strong>${fmt(g.raw_name_count)}</strong> 원 기술명</span><span class="metric-chip"><strong>${fmt(g.claim_count)}</strong> claims</span><span class="metric-chip"><strong>${fmt(g.source_count)}</strong> 관련 자료</span></div>
    ${g.why_emerging ? `<div class="detail-subhead">부상 배경</div><p>${esc(g.why_emerging)}</p>` : ""}
    ${g.evidence_summary ? `<div class="detail-subhead">근거 요약</div><p>${esc(g.evidence_summary)}</p>` : ""}
    <div class="detail-subhead">포함된 원 기술명</div><div class="raw-name-list">${g.member_names.map(n => `<span>${esc(n)}</span>`).join("")}</div>
    <div class="detail-subhead">관련 원문 자료${links.length > 30 ? " (최대 30건 표시)" : ""}</div><div class="source-link-row">${links.slice(0,30).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.source_name)} · ${esc(s.title)}</a>`).join("") || `<span class="note">원문 링크 없음</span>`}</div>
    ${state.map.stats.single_stage ? `<button class="leaf-source" type="button" id="open-parent">이 기술군의 자료 보기 ↗</button>` : g.parent_id ? `<button class="leaf-source" type="button" id="open-parent">연결된 상위기술군 보기 ↗</button>` : ""}`;
  if (state.map.stats.single_stage || g.parent_id) $("open-parent").addEventListener("click", async () => { switchView("family"); await selectGroup(state.map.stats.single_stage ? g.leaf_id : g.parent_id); $("main-panel").scrollIntoView({behavior:"smooth",block:"start"}); });
}

function selectMapLeaf(id) {
  state.mapSelected = id;
  renderMapList();
  renderMapDetail();
  drawMap();
}

function mapPosition(g, width, height) {
  const pad = 27;
  return [pad + g.x * (width - pad*2), pad + (1-g.y) * (height-pad*2)];
}

function drawMap() {
  if (!state.map || state.view !== "leaf") return;
  const canvas = $("cluster-map");
  const rect = canvas.getBoundingClientRect();
  const width = rect.width, height = rect.height;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width*dpr);
  canvas.height = Math.round(height*dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle = "#f8faf7";
  ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = "#e1e8df";
  ctx.lineWidth = 1;
  for (let k=1;k<4;k++) {
    const x=width*k/4, y=height*k/4;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();
  }
  const selected = state.mapSelected;
  for (const p of state.map.points) {
    const [x,y] = mapPosition(p,width,height);
    ctx.beginPath();ctx.arc(x,y,p.leaf_id === selected ? 3.3 : 1.45,0,Math.PI*2);
    ctx.fillStyle = p.leaf_id === selected ? "#0b6741" : p.leaf_id ? "rgba(56,110,75,.22)" : "rgba(128,145,132,.18)";
    ctx.fill();
  }
  const visible = new Set(mapGroups().map(g => g.leaf_id));
  for (const g of state.map.groups) {
    const [x,y] = mapPosition(g,width,height);
    const radius = Math.min(14,Math.max(4.5,3.5+Math.sqrt(g.raw_name_count)*1.3));
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fillStyle = !visible.has(g.leaf_id) ? "rgba(153,166,153,.25)" : g.retained ? "rgba(35,115,78,.78)" : "rgba(216,135,76,.83)";
    ctx.fill();
    if (g.leaf_id === selected) {ctx.beginPath();ctx.arc(x,y,radius+4,0,Math.PI*2);ctx.strokeStyle="#103f2b";ctx.lineWidth=2.5;ctx.stroke();}
  }
}

function nearestMapGroup(event) {
  const canvas = $("cluster-map");
  const r = canvas.getBoundingClientRect();
  const x=event.clientX-r.left, y=event.clientY-r.top;
  let best=null, distance=23;
  for (const g of mapGroups()) {
    const [gx,gy]=mapPosition(g,r.width,r.height);
    const d=Math.hypot(x-gx,y-gy);
    if(d<distance){best=g;distance=d;}
  }
  return best;
}

async function loadMap() {
  if (!state.map) {
    $("map-detail").innerHTML = `<div class="empty-state">1차 군집을 불러오는 중입니다…</div>`;
    try { state.map = await getJSON(runAPI("leaf-map")); }
    catch (error) { $("map-detail").innerHTML = `<div class="empty-state" role="alert">군집도를 불러오지 못했습니다: ${esc(error.message)}</div>`; return; }
  }
  const s=state.map.stats;
  $("map-counts").innerHTML = s.single_stage
    ? [[s.first_stage_groups,"최종 기술군"],[s.first_stage_unassigned,"미배정 원 기술명"]].map(([n,t]) => `<div><strong>${fmt(n)}</strong><span>${t}</span></div>`).join("")
    : s.partial
    ? [[s.retained_groups,"현재 저장된 1차 군집"],[s.input_names,"소속 원 기술명"]].map(([n,t]) => `<div><strong>${fmt(n)}</strong><span>${t}</span></div>`).join("")
    : [[s.first_stage_groups,"1차 후보"],[s.retained_groups,"2차 유지"],[s.excluded_groups,"2차 제외"]].map(([n,t]) => `<div><strong>${fmt(n)}</strong><span>${t}</span></div>`).join("");
  $("map-caption").textContent = s.partial
    ? "현재 저장된 결과의 1차 군집 중 2차에서도 유지된 군집만 보여줍니다. 2차 제외 군집은 이전 결과에 저장되지 않았습니다. 위치는 상위군별 관계 배치이며 유사도/PCA 지도가 아닙니다. 업데이트된 코드로 normalize를 다시 실행하면 전체 1차 군집의 PCA 지도로 전환됩니다."
    : `원 기술명 임베딩을 2차원으로 투영한 탐색 지도입니다. 실제 군집 판정은 ${s.pca_dims}차원에서 이루어졌으므로, 화면상 점 사이 거리는 정확한 유사도가 아닙니다.`;
  $("map-axis-note").textContent = s.partial ? "RELATIONSHIP LAYOUT · NOT A DISTANCE MAP" : "PCA 2D DISPLAY ONLY · CLICK A CLUSTER TO EXPLORE";
  $("leaf-status").hidden = Boolean(s.single_stage);
  $("leaf-status").querySelector('option[value="excluded"]').disabled = Boolean(s.partial || s.single_stage);
  state.mapStatus = "all";
  if (!state.mapSelected) state.mapSelected = [...state.map.groups].sort((a,b)=>b.claim_count-a.claim_count)[0]?.leaf_id || "";
  selectMapLeaf(state.mapSelected);
}

function renderRunChoices() {
  const options = state.runs.map(r => `<option value="${esc(r.run_id)}">${esc(r.label)} · ${esc(r.created_at.slice(0,16).replace("T"," "))}</option>`).join("");
  for (const id of ["run-select","compare-a","compare-b"]) $(id).innerHTML = options;
  $("run-select").value = state.runId;
  $("compare-a").value = state.runs[1]?.run_id || state.runId;
  $("compare-b").value = state.runId;
  renderRunMeta();
}

function renderRunMeta() {
  const r = state.runs.find(x => x.run_id === state.runId);
  if (!r) return;
  const p = r.parameters || {};
  $("run-meta").textContent = `입력 ${String(r.input_sha256||"").slice(0,10)}… · leaf PCA ${p.LEAF_HDBSCAN_PCA_DIMS ?? "?"} / min ${p.LEAF_MIN_CLUSTER_SIZE ?? "?"} / samples ${p.LEAF_MIN_SAMPLES ?? "?"}${p.PARENT_MIN_CLUSTER_SIZE != null ? ` · parent PCA ${p.PARENT_HDBSCAN_PCA_DIMS ?? "?"} / min ${p.PARENT_MIN_CLUSTER_SIZE}` : ""}${r.parameters_verified ? "" : " · 파라미터 기록 미검증"}${r.mutable ? " · 최신 결과는 덮어써질 수 있음" : ""}`;
}

async function loadRun(runId, requestedParent = "") {
  state.runId = runId;
  state.catalog = await getJSON(runAPI("catalog"));
  state.selected = null; state.detail = null; state.map = null; state.mapSelected = "";
  state.leafFilter = ""; state.sourceQuery = ""; state.visible = 12;
  $("run-select").value = runId;
  renderRunMeta(); renderStats(); renderGroups(); renderEvidenceLandscape();
  const first = state.catalog.groups.find(g => g.parent_id === requestedParent) || state.catalog.groups[0];
  if (first) await selectGroup(first.parent_id);
  const url = new URL(location.href);
  if (runId === "latest") url.searchParams.delete("run"); else url.searchParams.set("run",runId);
  history.replaceState(null,"",url);
  if (state.view === "leaf") await loadMap();
  if (state.view === "synthesis") { await loadLab(); history.replaceState(null,"","#synthesis"); }
}

function renderCompare(data) {
  const pA = data.a.parameters || {}, pB = data.b.parameters || {};
  const keys = ["LEAF_HDBSCAN_PCA_DIMS","LEAF_MIN_CLUSTER_SIZE","LEAF_MIN_SAMPLES","LEAF_NOISE_ASSIGN_SIM",...((pA.PARENT_MIN_CLUSTER_SIZE != null || pB.PARENT_MIN_CLUSTER_SIZE != null) ? ["PARENT_HDBSCAN_PCA_DIMS","PARENT_MIN_CLUSTER_SIZE","PARENT_MIN_SAMPLES","PARENT_NOISE_ASSIGN_SIM"] : [])];
  const parameters = keys.map(key => `<tr class="${String(pA[key])!==String(pB[key]) ? "changed" : ""}"><th>${esc(key)}</th><td>${esc(pA[key] ?? "—")}</td><td>${esc(pB[key] ?? "—")}</td></tr>`).join("");
  const metric = (title,a,b,unit="") => `<div class="compare-metric"><span>${title}</span><strong>${fmt(a)}${unit} → ${fmt(b)}${unit}</strong></div>`;
  const sizeMax = Math.max(1,...data.stats_a.sizes.map(g=>g.claims),...data.stats_b.sizes.map(g=>g.claims));
  const sizeList = (items) => `<div class="size-list">${items.map(g => `<div><span>${esc(g.name)}</span><span class="size-bar-track"><i style="width:${(g.claims/sizeMax*100).toFixed(1)}%"></i></span><strong>${fmt(g.claims)}</strong></div>`).join("")}</div>`;
  const flows = data.flows.slice(0,30).map(f => `<div class="flow-row"><span>${esc(f.from_name)}</span><strong>→ ${fmt(f.claims)}건 · 겹침 ${Math.round(f.jaccard*100)}%</strong><span>${esc(f.to_name)}</span></div>`).join("");
  const structural = [...data.splits.map(s=>`<span>분리 후보 · ${esc(s.name)} → ${fmt(s.targets)}개 기술군</span>`),...data.merges.map(m=>`<span>병합 후보 · ${fmt(m.origins)}개 기술군 → ${esc(m.name)}</span>`)].join("");
  $("compare-content").innerHTML = `${!data.same_input ? `<div class="compare-warning" role="alert">입력 claims의 해시가 다릅니다. 군집 변화에는 데이터 변경 효과가 섞여 있으므로 claim 이동 비교를 표시하지 않습니다.</div>` : `<div class="compare-ok">입력 claims 동일 · 공통 최종 claim ${fmt(data.common_claims)}건 · A에만 ${fmt(data.only_a)}건 / B에만 ${fmt(data.only_b)}건</div>`}
    ${!data.a.parameters_verified || !data.b.parameters_verified ? `<p class="note">이전 실행의 일부 파라미터는 normalize 시점 기록이 없어 현재 config 값에서 추정했습니다. 수치 차이는 참고용이며, 이후 실행부터 파라미터가 검증·보존됩니다.</p>` : ""}
    <div class="section-head"><div><div class="section-kicker">01 / OUTCOME</div><h3>결과 변화</h3></div></div>
    <div class="compare-metrics">${metric("최종 기술군",data.stats_a.groups,data.stats_b.groups)}${metric("최종 포함 claims",data.stats_a.claims,data.stats_b.claims)}${metric("최대 기술군 비중",Math.round(data.stats_a.largest_share*100),Math.round(data.stats_b.largest_share*100),"%")}</div>
    <div class="section-head"><div><div class="section-kicker">02 / PARAMETERS</div><h3>파라미터 비교</h3></div></div><div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>설정</th><th>A</th><th>B</th></tr></thead><tbody>${parameters}</tbody></table></div>
    <div class="section-head"><div><div class="section-kicker">03 / DISTRIBUTION</div><h3>기술군 크기</h3></div></div><div class="compare-sizes"><div><h4>실행 A</h4>${sizeList(data.stats_a.sizes)}</div><div><h4>실행 B</h4>${sizeList(data.stats_b.sizes)}</div></div>
    ${data.same_input ? `<div class="section-head"><div><div class="section-kicker">04 / MOVEMENT</div><h3>기술군 간 claim 이동</h3></div><span>상위 30개 연결 · 동일 claim 기준</span></div>${structural ? `<div class="structure-candidates">${structural}</div>` : `<p class="note">유의미한 분리·병합 후보가 없습니다.</p>`}<div class="flow-list">${flows}</div><p class="note">겹침은 두 기술군의 claim 집합 Jaccard 비율입니다. 분리·병합 후보는 연결된 claim이 3건 이상이고 양쪽 군집의 10% 이상인 경우만 표시합니다. ID 번호 자체는 실행 간 비교하지 않습니다.</p>` : ""}`;
}

function renderTranscript() {
  if (!state.transcript) return;
  const query = $("transcript-search").value.trim().toLowerCase();
  const rows = state.transcript.chunks.flatMap(chunk => (chunk.trends || []).map(trend => ({ ...trend, chunk: chunk.index })));
  const visible = rows.filter(row => `${row.name} ${row.background} ${row.evidence}`.toLowerCase().includes(query));
  $("transcript-count").textContent = `${visible.length}개 후보 / 전체 ${rows.length}개 · ${state.transcript.chunk_count}개 청크`;
  $("transcript-list").innerHTML = visible.map(row => `<article class="transcript-card">
    <div class="transcript-meta">CHUNK ${fmt(row.chunk)} · ${esc(row.confidence || "신뢰도 미표기")}</div>
    <h3>${esc(row.name)}</h3>
    <div class="transcript-fields"><section><h4>BACKGROUND · 기술 배경</h4><p>${esc(row.background || "배경 없음")}</p></section>
    <section><h4>EVIDENCE · 추출 근거</h4><blockquote>${esc(row.evidence || "근거 없음")}</blockquote></section></div>
  </article>`).join("") || `<p class="empty-state">검색 결과가 없습니다.</p>`;
}

async function loadTranscript() {
  if (!state.transcript) {
    $("transcript-list").innerHTML = `<div class="empty-state">추출 결과를 불러오는 중입니다…</div>`;
    try { state.transcript = await getJSON("/api/transcript-extract"); }
    catch (error) { $("transcript-list").innerHTML = `<div class="empty-state" role="alert">추출 결과를 읽을 수 없습니다: ${esc(error.message)}</div>`; return; }
  }
  renderTranscript();
}

async function loadCompare() {
  const a = $("compare-a").value, b = $("compare-b").value;
  if (!a || !b) return;
  $("compare-content").innerHTML = `<div class="empty-state">비교 결과를 계산하는 중입니다…</div>`;
  try { renderCompare(await getJSON(`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)); }
  catch (error) { $("compare-content").innerHTML = `<div class="empty-state" role="alert">비교할 수 없습니다: ${esc(error.message)}</div>`; }
}

function renderLabResult(result, target) {
  if (!result) { $(target).innerHTML = `<p class="lab-muted">결과가 없습니다.</p>`; return; }
  $(target).innerHTML = `<h4>${esc(result.name || "이름 없음")}</h4>
    <strong>정의</strong><p>${esc(result.definition || "—")}</p>
    <strong>공통 근거</strong><p>${esc(result.evidence_summary || "—")}</p>
    <strong>왜 부상하는가</strong><p>${esc(result.why_emerging || "—")}</p>
    ${result.core_technologies?.length ? `<strong>관련 기술</strong><p>${esc(result.core_technologies.join(" · "))}</p>` : ""}
    ${result.conflicting_signals?.length ? `<strong>상충 신호</strong><p>${esc(result.conflicting_signals.join(" · "))}</p>` : ""}`;
}

function saveLabDraft() {
  try { localStorage.setItem("synthesis-lab-draft-v1", JSON.stringify({prompt:$("lab-prompt").value,reduce_prompt:$("lab-reduce-prompt").value})); }
  catch (_) {}
}

async function loadLabHistory() {
  const leaf = $("lab-group").value;
  if (!leaf) return;
  const rows = await getJSON(`/api/synthesis/history?run=${encodeURIComponent(state.runId)}&leaf=${encodeURIComponent(leaf)}`);
  $("lab-history-list").innerHTML = rows.length ? rows.map(row => `<div class="lab-attempt" data-attempt="${esc(row.job_id)}">
    <strong>${esc(row.result?.name || (row.status === "failed" ? "실패한 시도" : "결과 없음"))}</strong>
    <small>${esc(row.created_at)} · ${row.parts > 1 ? `${fmt(row.parts)}개 부분 종합` : "직접 종합"}</small>
    ${row.error ? `<small class="lab-error">${esc(row.error)}</small>` : ""}
    <div><button type="button" class="lab-secondary" data-action="view">결과 보기</button> <button type="button" class="lab-secondary" data-action="reuse">프롬프트 불러오기</button></div></div>`).join("") : `<p class="lab-muted">아직 저장된 시도가 없습니다.</p>`;
  $("lab-history-list").querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", async () => {
    const jobId = button.closest("[data-attempt]").dataset.attempt;
    try {
      const attempt = await getJSON(`/api/synthesis/attempts/${encodeURIComponent(jobId)}`);
      if (button.dataset.action === "reuse") {
        $("lab-prompt").value = attempt.prompt || "";
        $("lab-reduce-prompt").value = attempt.reduce_prompt || "";
        saveLabDraft();
        $("lab-status").textContent = "이전 프롬프트를 불러왔습니다.";
        $("lab-prompt").scrollIntoView({behavior:"smooth",block:"center"});
      } else {
        renderLabResult(attempt.result, "lab-result");
        if (attempt.error) $("lab-result").innerHTML = `<p class="lab-error">${esc(attempt.error)}</p>`;
        $("lab-result").scrollIntoView({behavior:"smooth",block:"center"});
      }
    } catch (error) { $("lab-status").textContent = `불러오기 실패: ${error.message}`; }
  }));
}

async function loadLabGroup() {
  const leaf = $("lab-group").value;
  if (!leaf) return;
  state.labCurrent = await getJSON(`/api/synthesis/group?run=${encodeURIComponent(state.runId)}&leaf=${encodeURIComponent(leaf)}`);
  const item = state.labCurrent;
  $("lab-group-meta").textContent = `${fmt(item.group.raw_name_count)}개 원 기술명 · ${fmt(item.member_count)} claims · ${item.parts === 1 ? "직접 종합" : `${fmt(item.parts)}개 부분 종합 후 최종 통합`}`;
  $("lab-input-count").textContent = `(${fmt(item.member_count)}건)`;
  renderLabResult(item.group, "lab-baseline");
  $("lab-result").innerHTML = `<p class="lab-muted">이 군집에서 실행한 결과가 여기에 표시됩니다.</p>`;
  $("lab-input").innerHTML = item.members.map(row => `<article class="lab-claim"><strong>${esc(row.name)}</strong><small>claim_id ${fmt(row.claim_id)} · ${esc(row.source_type)} / ${esc(row.source_name)} · ${esc(row.doc_title || "")}</small><p><b>배경</b> ${esc(row.background || "")}</p><p><b>근거</b> ${esc(row.evidence || "")}</p></article>`).join("");
  $("lab-reduce-wrap").open = item.parts > 1;
  await loadLabHistory();
}

async function loadLab() {
  if (!state.labDefaults) {
    state.labDefaults = await getJSON("/api/synthesis/defaults");
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem("synthesis-lab-draft-v1") || "{}"); } catch (_) {}
    $("lab-prompt").value = draft.prompt || state.labDefaults.prompt;
    $("lab-reduce-prompt").value = draft.reduce_prompt || state.labDefaults.reduce_prompt;
  }
  if (state.labRunId !== state.runId) {
    state.labGroups = await getJSON(`/api/synthesis/groups?run=${encodeURIComponent(state.runId)}`);
    state.labRunId = state.runId;
    $("lab-group").innerHTML = state.labGroups.map(row => `<option value="${esc(row.leaf_id)}">${esc(row.leaf_id)} · ${esc(row.name)} (${fmt(row.claim_count)} claims)</option>`).join("");
    $("lab-group").value = state.labGroups.find(row => row.leaf_id === state.mapSelected)?.leaf_id || state.labGroups[0]?.leaf_id || "";
    await loadLabGroup();
  }
}

async function runLab() {
  if (!state.labCurrent) return;
  const button = $("lab-run"), status = $("lab-status");
  button.disabled = true;
  $("lab-group").disabled = true;
  status.textContent = "실험을 등록하는 중입니다…";
  const runId = state.runId, leafId = $("lab-group").value;
  try {
    const job = await postJSON("/api/synthesis/jobs", {
      run_id:runId,leaf_id:leafId,prompt:$("lab-prompt").value,
      reduce_prompt:$("lab-reduce-prompt").value,
    });
    state.labJobId = job.job_id;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      const progress = await getJSON(`/api/synthesis/jobs/${encodeURIComponent(job.job_id)}`);
      status.textContent = `${progress.status === "running" ? "실행 중" : progress.status === "queued" ? "대기 중" : progress.status === "completed" ? "완료" : "실패"} · ${progress.progress}`;
      if (progress.status === "completed" || progress.status === "failed") {
        if (state.runId === runId && $("lab-group").value === leafId) {
          if (progress.result) renderLabResult(progress.result, "lab-result");
          if (progress.error) $("lab-result").innerHTML = `<p class="lab-error">${esc(progress.error)}</p>`;
          await loadLabHistory();
        }
        break;
      }
    }
  } catch (error) { status.textContent = `실행 실패: ${error.message}`; }
  finally { button.disabled = false; $("lab-group").disabled = false; state.labJobId = ""; }
}

function switchView(view) {
  state.view = view;
  $("nav-family").classList.toggle("nav-active",view === "family");
  $("nav-leaf-map").classList.toggle("nav-active",view === "leaf");
  $("nav-synthesis").classList.toggle("nav-active",view === "synthesis");
  $("nav-compare").classList.toggle("nav-active",view === "compare");
  $("nav-transcript").classList.toggle("nav-active",view === "transcript");
  $("nav-family").setAttribute("aria-current",view === "family" ? "page" : "false");
  $("nav-leaf-map").setAttribute("aria-current",view === "leaf" ? "page" : "false");
  $("nav-synthesis").setAttribute("aria-current",view === "synthesis" ? "page" : "false");
  $("nav-compare").setAttribute("aria-current",view === "compare" ? "page" : "false");
  $("nav-transcript").setAttribute("aria-current",view === "transcript" ? "page" : "false");
  $("leaf-map-page").hidden = view !== "leaf";
  $("synthesis-page").hidden = view !== "synthesis";
  document.querySelector(".explorer").hidden = view !== "family";
  $("evidence-landscape").hidden = view !== "family";
  $("compare-page").hidden = view !== "compare";
  $("transcript-page").hidden = view !== "transcript";
  if (view === "leaf") { history.replaceState(null,"","#leaf-map"); loadMap(); }
  else if (view === "synthesis") { history.replaceState(null,"","#synthesis"); loadLab().catch(error => {$("lab-status").textContent=`불러오기 실패: ${error.message}`;}); }
  else if (view === "compare") { history.replaceState(null,"","#compare"); loadCompare(); }
  else if (view === "transcript") { history.replaceState(null,"","#transcript"); loadTranscript(); }
  else { history.replaceState(null,"",`#${state.selected || ""}`); }
}

async function init() {
  try {
    $("nav-family").addEventListener("click",()=>switchView("family"));
    $("nav-leaf-map").addEventListener("click",()=>switchView("leaf"));
    $("nav-synthesis").addEventListener("click",()=>switchView("synthesis"));
    $("nav-compare").addEventListener("click",()=>switchView("compare"));
    $("nav-transcript").addEventListener("click",()=>switchView("transcript"));
    $("transcript-search").addEventListener("input",renderTranscript);
    $("lab-group").addEventListener("change",()=>loadLabGroup().catch(error => {$("lab-status").textContent=`군집을 불러올 수 없습니다: ${error.message}`;}));
    $("lab-prompt").addEventListener("input",saveLabDraft);
    $("lab-reduce-prompt").addEventListener("input",saveLabDraft);
    $("lab-reset").addEventListener("click",()=>{ $("lab-prompt").value=state.labDefaults.prompt;$("lab-reduce-prompt").value=state.labDefaults.reduce_prompt;saveLabDraft(); });
    $("lab-run").addEventListener("click",runLab);
    $("compare-a").addEventListener("change",loadCompare);
    $("compare-b").addEventListener("change",loadCompare);
    $("run-select").addEventListener("change",e=>loadRun(e.target.value));
    $("leaf-search").addEventListener("input",e=>{state.mapQuery=e.target.value;renderMapList();drawMap();});
    $("leaf-status").addEventListener("change",e=>{state.mapStatus=e.target.value;renderMapList();drawMap();});
    $("cluster-map").addEventListener("click",e=>{const g=nearestMapGroup(e);if(g)selectMapLeaf(g.leaf_id);});
    $("cluster-map").addEventListener("mousemove",e=>{
      const g=nearestMapGroup(e), tip=$("map-tooltip"), canvas=$("cluster-map");
      tip.hidden=!g;
      if(g){tip.textContent=`${g.name} · ${g.claim_count} claims${state.map.stats.single_stage ? "" : ` · ${g.retained ? "2차 유지" : "2차 제외"}`}`;tip.style.left=`${canvas.offsetLeft+e.offsetX+12}px`;tip.style.top=`${canvas.offsetTop+e.offsetY+12}px`;}
    });
    $("cluster-map").addEventListener("mouseleave",()=>{$("map-tooltip").hidden=true;});
    window.addEventListener("resize",drawMap);
    state.runs = await getJSON("/api/runs");
    const savedRun = new URL(location.href).searchParams.get("run");
    state.runId = state.runs.some(r => r.run_id === savedRun) ? savedRun : "latest";
    renderRunChoices();
    const requested = location.hash.slice(1);
    await loadRun(state.runId, requested);
    $("group-search").addEventListener("input", e => { state.query = e.target.value; renderGroups(); });
    if (requested === "leaf-map") switchView("leaf");
    
    if (requested === "compare") switchView("compare");
    
  } catch (error) {
    $("main-panel").innerHTML = `<div class="empty-state" role="alert">결과 파일을 읽을 수 없습니다: ${esc(error.message)}</div>`;
  }
}
init();
