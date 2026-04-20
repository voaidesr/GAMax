import Plotly from 'plotly.js-dist-min';
import './style.css';

// ── State ─────────────────────────────────────────────────────────────────────
let config     = null;
let population = [];
let prevPop    = [];
let seed       = 0;
let generation = 0;
let maxGens    = 50;
let chartReady = false;
let evoChartReady = false;
let evoOpen    = false;
let theoryPoint = null;   // { x, y } — vertex of parabola clamped to domain
let evoHistory  = { gens: [], maxF: [], avgF: [] };

// Stored polynomial/domain params (needed across handlers)
let _a, _b, _c, _xMin, _xMax;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const initBtn      = document.getElementById('btn-init');
const nextBtn      = document.getElementById('btn-next');
const fastFwdBtn   = document.getElementById('btn-fastfwd');
const toggleEvoBtn = document.getElementById('btn-toggle-evo');
const closeEvoBtn  = document.getElementById('btn-evo-close');
const randomizeBtn = document.getElementById('btn-randomize');
const seedInput    = document.getElementById('seed');
const summaryDiv   = document.getElementById('summary');
const chartDiv     = document.getElementById('chart');
const evoPanel     = document.getElementById('evolution-panel');
const evoChartDiv  = document.getElementById('evolution-chart');
const placeholder  = document.getElementById('chart-placeholder');

const statGen    = document.getElementById('stat-gen');
const statMax    = document.getElementById('stat-max');
const statAvg    = document.getElementById('stat-avg');
const statTheory = document.getElementById('stat-theory');

// ── Plotly constants ──────────────────────────────────────────────────────────
const CURVE_COLOR  = '#c0392b';
const POINT_COLOR  = '#2563eb';
const GHOST_COLOR  = 'rgba(160,170,185,0.40)';
const THEORY_COLOR = '#aaaaaa';
const FONT_MONO    = "'JetBrains Mono', monospace";
const FONT_SANS    = "'Inter', sans-serif";

const BASE_LAYOUT = {
  template:      'plotly_white',
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#ffffff',
  margin:        { t: 16, l: 54, r: 18, b: 44 },
  font:          { family: FONT_SANS, size: 12, color: '#5a6070' },
  xaxis: {
    title:         { text: 'x', font: { family: FONT_MONO, size: 12 } },
    zeroline:      true, zerolinecolor: '#c8ccd4', zerolinewidth: 1,
    gridcolor:     '#ebedf1', linecolor: '#d0d4db',
    tickfont:      { family: FONT_MONO, size: 10 },
  },
  yaxis: {
    title:         { text: 'f(x)', font: { family: FONT_MONO, size: 12 } },
    zeroline:      true, zerolinecolor: '#c8ccd4', zerolinewidth: 1,
    gridcolor:     '#ebedf1', linecolor: '#d0d4db',
    tickfont:      { family: FONT_MONO, size: 10 },
  },
  legend: {
    x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top',
    bgcolor:     'rgba(255,255,255,0.85)',
    bordercolor: '#e2e5ea', borderwidth: 1,
    font:        { family: FONT_SANS, size: 11 },
  },
  shapes:      [],
  annotations: [],
};

const PLOTLY_CONFIG = { responsive: true, displayModeBar: false };

// ── Utility ───────────────────────────────────────────────────────────────────
function evalPoly(a, b, c, x) { return a * x * x + b * x + c; }
function fmt(n, p = 4)        { return n.toFixed(p); }

function theoreticalMax(a, b, c, xMin, xMax) {
  const candidates = [xMin, xMax];
  if (Math.abs(a) > 1e-10) {
    const xV = -b / (2 * a);
    if (xV > xMin && xV < xMax) candidates.push(xV);
  }
  let bestX = candidates[0], bestY = evalPoly(a, b, c, bestX);
  for (const x of candidates) {
    const y = evalPoly(a, b, c, x);
    if (y > bestY) { bestX = x; bestY = y; }
  }
  return { x: bestX, y: bestY };
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function updateStats(gen, maxF, avgF) {
  statGen.textContent = gen;
  statMax.textContent = fmt(maxF);
  statAvg.textContent = fmt(avgF);
}

// ── Trace builders ────────────────────────────────────────────────────────────
function buildCurveTrace(a, b, c, xMin, xMax) {
  const xs = [], ys = [];
  for (let i = 0; i <= 400; i++) {
    const x = xMin + (xMax - xMin) * (i / 400);
    xs.push(x); ys.push(evalPoly(a, b, c, x));
  }
  return {
    x: xs, y: ys, type: 'scatter', mode: 'lines', name: 'f(x)',
    line: { color: CURVE_COLOR, width: 2.5 },
    hovertemplate: 'x=%{x:.4f}<br>f(x)=%{y:.4f}<extra></extra>',
  };
}

function buildGhostTrace(pop) {
  return {
    x: pop.map(i => i.trueVal), y: pop.map(i => i.fitness),
    type: 'scatter', mode: 'markers', name: 'Prev gen',
    marker: { color: GHOST_COLOR, size: 7, line: { width: 0 } },
    hovertemplate: 'x=%{x:.4f}<br>f(x)=%{y:.4f}<extra></extra>',
  };
}

function buildCurrentTrace(pop, label) {
  return {
    x: pop.map(i => i.trueVal), y: pop.map(i => i.fitness),
    type: 'scatter', mode: 'markers', name: label,
    marker: { color: POINT_COLOR, size: 9, opacity: 0.85, line: { color: '#1d4ed8', width: 1 } },
    hovertemplate: 'x=%{x:.4f}<br>f(x)=%{y:.4f}<extra></extra>',
  };
}

// Theoretical max: a vertical dashed line at x = theory.x
function theoryShapeAndAnnotation(theory, xMin, xMax) {
  return {
    shapes: [
      // Horizontal dotted reference at y = max
      {
        type: 'line', x0: xMin, x1: xMax,
        y0: theory.y, y1: theory.y,
        line: { dash: 'dot', color: THEORY_COLOR, width: 1 },
        layer: 'below',
      },
      // Vertical line at x = argmax
      {
        type: 'line', x0: theory.x, x1: theory.x,
        y0: 0, y1: 1, yref: 'paper',
        line: { dash: 'dash', color: THEORY_COLOR, width: 1 },
        layer: 'below',
      },
    ],
  };
}

// ── Main chart ────────────────────────────────────────────────────────────────
function initChart(a, b, c, xMin, xMax, pop, theory) {
  const maxF = Math.max(...pop.map(i => i.fitness));
  const avgF = pop.reduce((s, i) => s + i.fitness, 0) / pop.length;
  updateStats(0, maxF, avgF);

  const { shapes } = theoryShapeAndAnnotation(theory, xMin, xMax);
  const layout = { ...BASE_LAYOUT, shapes };

  const traces = [
    buildCurveTrace(a, b, c, xMin, xMax),   // 0: curve
    buildGhostTrace([]),                      // 1: prev gen (empty)
    buildCurrentTrace(pop, 'Gen 0'),          // 2: current gen
  ];

  placeholder.style.display = 'none';

  if (chartReady) {
    Plotly.react(chartDiv, traces, layout, PLOTLY_CONFIG);
  } else {
    Plotly.newPlot(chartDiv, traces, layout, PLOTLY_CONFIG);
    chartReady = true;
  }
}

function updateChart(pop, ghost, gen) {
  Plotly.restyle(chartDiv, {
    x: [ghost.map(i => i.trueVal)],
    y: [ghost.map(i => i.fitness)],
  }, 1);
  Plotly.restyle(chartDiv, {
    x: [pop.map(i => i.trueVal)],
    y: [pop.map(i => i.fitness)],
    name: [`Gen ${gen}`],
  }, 2);
}

// ── Evolution chart ───────────────────────────────────────────────────────────
function renderEvoChart() {
  const traces = [
    {
      x: evoHistory.gens, y: evoHistory.maxF,
      type: 'scatter', mode: 'lines+markers', name: 'Maximum',
      line:   { color: CURVE_COLOR, width: 1.5 },
      marker: { color: CURVE_COLOR, size: 4 },
    },
    {
      x: evoHistory.gens, y: evoHistory.avgF,
      type: 'scatter', mode: 'lines', name: 'Average',
      line: { color: POINT_COLOR, width: 1.5, dash: 'dot' },
    },
  ];

  // Add theoretical max as horizontal reference
  const theoryVal = theoryPoint ? theoryPoint.y : undefined;
  if (theoryVal !== undefined) {
    traces.push({
      x: evoHistory.gens.length > 0
        ? [evoHistory.gens[0], evoHistory.gens[evoHistory.gens.length - 1]]
        : [0, maxGens],
      y: [theoryVal, theoryVal],
      type: 'scatter', mode: 'lines', name: 'Theoretical max',
      line: { color: THEORY_COLOR, width: 1, dash: 'dot' },
    });
  }

  const layout = {
    template:      'plotly_white',
    paper_bgcolor: '#f7f8fa',
    plot_bgcolor:  '#f7f8fa',
    margin:        { t: 10, l: 50, r: 16, b: 36 },
    font:          { family: FONT_SANS, size: 11, color: '#5a6070' },
    xaxis: {
      title:    { text: 'Generation', font: { family: FONT_MONO, size: 10 } },
      gridcolor:'#e8eaee', tickfont: { family: FONT_MONO, size: 9 },
    },
    yaxis: {
      title:    { text: 'f(x)', font: { family: FONT_MONO, size: 10 } },
      gridcolor:'#e8eaee', tickfont: { family: FONT_MONO, size: 9 },
    },
    legend: {
      orientation: 'h', x: 0, y: 1.12,
      font: { family: FONT_SANS, size: 10 },
      bgcolor: 'transparent',
    },
  };

  if (evoChartReady) {
    Plotly.react(evoChartDiv, traces, layout, PLOTLY_CONFIG);
  } else {
    Plotly.newPlot(evoChartDiv, traces, layout, PLOTLY_CONFIG);
    evoChartReady = true;
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
function setRandomSeed() { seedInput.value = Math.floor(Math.random() * (2 ** 31 - 1)); }
randomizeBtn.addEventListener('click', setRandomSeed);
setRandomSeed();

// ── Evolution toggle ──────────────────────────────────────────────────────────
function openEvo() {
  evoOpen = true;
  evoPanel.classList.add('open');
  toggleEvoBtn.classList.add('active');
  renderEvoChart();
}

function closeEvo() {
  evoOpen = false;
  evoPanel.classList.remove('open');
  toggleEvoBtn.classList.remove('active');
}

toggleEvoBtn.addEventListener('click', () => evoOpen ? closeEvo() : openEvo());
closeEvoBtn.addEventListener('click', closeEvo);

// ── Initialize ────────────────────────────────────────────────────────────────
initBtn.addEventListener('click', async () => {
  _a    = parseFloat(document.getElementById('coef-a').value);
  _b    = parseFloat(document.getElementById('coef-b').value);
  _c    = parseFloat(document.getElementById('coef-c').value);
  _xMin = parseFloat(document.getElementById('dom-a').value);
  _xMax = parseFloat(document.getElementById('dom-b').value);
  const popSz  = parseInt(document.getElementById('pop-size').value, 10);
  const prec   = parseInt(document.getElementById('precision').value, 10);
  const crossP = parseFloat(document.getElementById('cross-p').value);
  const mutP   = parseFloat(document.getElementById('mut-p').value);
  maxGens      = parseInt(document.getElementById('num-gens').value, 10);

  const seedVal = parseInt(seedInput.value, 10);
  seed = isNaN(seedVal) ? Math.floor(Math.random() * (2 ** 31 - 1)) : seedVal;
  seedInput.value = seed;

  if (_xMin >= _xMax || popSz < 2) return;

  initBtn.disabled = true;
  nextBtn.disabled = true;
  fastFwdBtn.disabled = true;
  summaryDiv.style.display = 'none';

  try {
    const cfgRes = await fetch('/api/init_config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popSz, dom: [_xMin, _xMax], coef: [_a, _b, _c], prec, crossP, mutP }),
    });
    if (!cfgRes.ok) throw new Error(`init_config: ${cfgRes.status}`);
    config = await cfgRes.json();

    const popRes = await fetch('/api/init_population', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initCfg: config, initSeed: seed }),
    });
    if (!popRes.ok) throw new Error(`init_population: ${popRes.status}`);
    const popData = await popRes.json();

    population = popData.resultPop;
    seed       = popData.afterSeed;
    prevPop    = [];
    generation = 0;

    // Theoretical maximum
    theoryPoint = theoreticalMax(_a, _b, _c, _xMin, _xMax);
    statTheory.textContent = `${fmt(theoryPoint.y)} at x = ${fmt(theoryPoint.x)}`;

    // Initial evolution history (Gen 0)
    const maxF0 = Math.max(...population.map(i => i.fitness));
    const avgF0 = population.reduce((s, i) => s + i.fitness, 0) / population.length;
    evoHistory = { gens: [0], maxF: [maxF0], avgF: [avgF0] };

    initChart(_a, _b, _c, _xMin, _xMax, population, theoryPoint);
    if (evoOpen) renderEvoChart();

    nextBtn.disabled = false;
    fastFwdBtn.disabled = false;
    nextBtn.textContent = `Next Generation  (1 / ${maxGens})`;
    initBtn.disabled = false;

  } catch (err) {
    console.error(err);
    initBtn.disabled = false;
  }
});

// ── Core step (shared by Next and Fast Forward) ────────────────────────────────
async function stepGeneration() {
  const res = await fetch('/api/next_generation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reqConfig: config, reqPop: population, reqSeed: seed }),
  });
  if (!res.ok) throw new Error(`next_generation: ${res.status}`);
  const data = await res.json();

  prevPop    = population.slice();
  population = data.nextPop;
  seed       = data.nextSeed;
  generation++;

  const { maxFitVal, avgFitVal } = data.stats;
  evoHistory.gens.push(generation);
  evoHistory.maxF.push(maxFitVal);
  evoHistory.avgF.push(avgFitVal);
  updateStats(generation, maxFitVal, avgFitVal);

  return { maxFitVal, avgFitVal };
}

function showDone() {
  const best = population.reduce((b, i) => i.fitness > b.fitness ? i : b, population[0]);
  summaryDiv.innerHTML = `
    <strong>Complete — ${maxGens} generations</strong>
    Best x = <span class="mono">${best.trueVal.toFixed(6)}</span><br>
    Max f(x) = <span class="mono">${best.fitness.toFixed(6)}</span><br>
    Theoretical = <span class="mono">${theoryPoint.y.toFixed(6)}</span>
  `;
  summaryDiv.style.display = 'block';
  nextBtn.textContent = 'Done';
  nextBtn.disabled    = true;
  fastFwdBtn.disabled = true;
  fastFwdBtn.textContent = 'Fast Forward';
  initBtn.disabled    = false;

  // Auto-open evolution panel at the end
  if (!evoOpen) openEvo();
  else renderEvoChart();
}

// ── Next Generation ───────────────────────────────────────────────────────────
nextBtn.addEventListener('click', async () => {
  if (!config || generation >= maxGens) return;
  nextBtn.disabled  = true;
  initBtn.disabled  = true;
  fastFwdBtn.disabled = true;

  try {
    await stepGeneration();
    updateChart(population, prevPop, generation);
    if (evoOpen) renderEvoChart();

    if (generation >= maxGens) {
      showDone();
    } else {
      nextBtn.disabled    = false;
      fastFwdBtn.disabled = false;
      initBtn.disabled    = false;
      nextBtn.textContent = `Next Generation  (${generation + 1} / ${maxGens})`;
    }
  } catch (err) {
    console.error(err);
    nextBtn.disabled    = false;
    fastFwdBtn.disabled = false;
    initBtn.disabled    = false;
  }
});

// ── Fast Forward ──────────────────────────────────────────────────────────────
fastFwdBtn.addEventListener('click', async () => {
  if (!config || generation >= maxGens) return;
  nextBtn.disabled       = true;
  initBtn.disabled       = true;
  fastFwdBtn.disabled    = true;
  fastFwdBtn.textContent = 'Running...';

  try {
    while (generation < maxGens) {
      await stepGeneration();
    }
    // Render final state
    updateChart(population, prevPop, generation);
    showDone();
  } catch (err) {
    console.error(err);
    nextBtn.disabled       = false;
    fastFwdBtn.disabled    = false;
    fastFwdBtn.textContent = 'Fast Forward';
    initBtn.disabled       = false;
  }
});
