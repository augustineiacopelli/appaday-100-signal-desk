/* Signal Desk session-two surface tests */
var fs = require('fs');
var { JSDOM } = require('jsdom');

var pass = 0, fail = 0, failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function near(name, a, b, tol) {
  tol = tol === undefined ? 1e-9 : tol;
  ok(name, Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), 'got ' + a + ' want ' + b);
}

var html = fs.readFileSync('app100.html', 'utf8');
var dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://augustineiacopelli.github.io/appaday-100-signal-desk/' });
var win = dom.window, doc = win.document;

/* ---- canvas stub ---- */
var CTX = null;
function makeCtx() {
  var calls = { fill: 0, stroke: 0, fillText: 0, rrect: 0 };
  var c = {
    calls: calls, canvas: null,
    setTransform: function () {}, clearRect: function () {}, beginPath: function () { calls.rrect++; },
    moveTo: function () {}, lineTo: function () {}, arcTo: function () {}, closePath: function () {},
    rect: function () {}, arc: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}, setLineDash: function () {},
    fill: function () { calls.fill++; }, stroke: function () { calls.stroke++; },
    fillText: function () { calls.fillText++; },
    measureText: function (s) { return { width: String(s).length * 6 }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; }
  };
  return c;
}
var CANVAS_OFF = false;
win.HTMLCanvasElement.prototype.getContext = function () {
  if (CANVAS_OFF) return null;
  CTX = makeCtx();
  return CTX;
};
Object.defineProperty(win.Element.prototype, 'clientWidth', { get: function () { return 700; }, configurable: true });
Object.defineProperty(win.Element.prototype, 'clientHeight', { get: function () { return 400; }, configurable: true });

doc.dispatchEvent(new win.Event('DOMContentLoaded'));
var SD = win.SignalDesk;
ok('SignalDesk exported', !!SD);

/* ---------- 1. markup ---------- */
var panes = doc.querySelectorAll('.pane');
eq('nine panes', panes.length, 9);
var tipMissing = [];
for (var i = 0; i < panes.length; i++) {
  if (!panes[i].querySelector('.tip')) tipMissing.push(panes[i].id);
}
eq('every pane carries a tip', tipMissing.join(','), '');
var tabs = doc.querySelectorAll('#tabs .tab');
eq('nine tabs', tabs.length, 9);
eq('drivers tab follows compare', tabs[5].getAttribute('data-pane') + '>' + tabs[6].getAttribute('data-pane'), 'compare>drivers');
eq('drivers tab label', tabs[6].textContent, 'Drivers');
ok('drivers pane exists', !!doc.getElementById('pane-drivers'));
['d-mode', 'd-meas', 'd-agg', 'd-dim', 'd-grain', 'd-run', 'd-seg', 'd-per', 'd-sdim', 'd-a', 'd-b', 'd-pdim', 'd-pa', 'd-pb', 'drvout']
  .forEach(function (id) { ok('element ' + id, !!doc.getElementById(id)); });
ok('drvout inside drivers pane', doc.getElementById('pane-drivers').contains(doc.getElementById('drvout')));

/* ---------- 2. help ---------- */
eq('HELP length', SD.HELP.length, 66);
var drv = SD.HELP.filter(function (h) { return h.c === 'Drivers'; });
eq('five Drivers entries', drv.length, 5);
ok('a Drivers entry denies causation',
  drv.some(function (h) { return /not causation/i.test(h.a); }));
ok('a Drivers entry covers mix and rate',
  drv.some(function (h) { return /interaction/i.test(h.a) && /mix/i.test(h.a); }));
ok('every Drivers entry has q and a', drv.every(function (h) { return h.q && h.a && h.a.length > 80; }));

/* ---------- 3. exports ---------- */
['explain', 'contribSum', 'contribRate', 'etaSquared', 'paradoxCheck', 'driverCandidates',
 'aggregateRows', 'groupsForRows', 'renderDrivers', 'refreshDriverBuilder', 'drawWaterfall',
 'driverRun', 'driverRank', 'driverPeriods'].forEach(function (k) {
  ok('export ' + k, typeof SD[k] === 'function');
});

/* ---------- 4. load data ---------- */
SD.loadText(SD.sampleRetail(), 'retail-orders.csv');
var S = SD.S;
ok('rows loaded', S.rows.length > 200, String(S.rows.length));
ok('builder dims filled', doc.getElementById('d-dim').options.length > 0);
ok('builder meas has count option', doc.getElementById('d-meas').options[0].value === '-1');
eq('segment row hidden by default', doc.getElementById('d-seg').style.display, 'none');
eq('period row hidden by default', doc.getElementById('d-per').style.display, 'none');
eq('empty drvout message', doc.getElementById('drvout').querySelectorAll('.empty').length, 1);

var dimIdx = parseInt(doc.getElementById('d-dim').value, 10);
ok('builder preselects a non-date split field',
  S.profile.cols[dimIdx] && S.profile.cols[dimIdx].type !== 'date', String(dimIdx));
var measIdx = parseInt(doc.getElementById('d-meas').value, 10);
ok('a measure was preselected', measIdx >= 0, String(measIdx));

/* ---------- 5. selection mode with a real filter ---------- */
var catIdx = -1, catVal = null;
for (i = 0; i < S.profile.cols.length; i++) {
  var pc = S.profile.cols[i];
  if ((pc.type === 'category' || pc.type === 'boolean') && pc.uniq >= 3 && pc.uniq <= 12) { catIdx = i; catVal = (pc.all || pc.top)[0].v; break; }
}
ok('found a category to filter on', catIdx >= 0);
S.filters[catIdx] = { kind: 'cat', set: {} };
S.filters[catIdx].set[String(catVal)] = 1;
SD.applyFilters();
ok('filter narrowed the view', S.view.length < S.rows.length, S.view.length + ' of ' + S.rows.length);

doc.getElementById('d-mode').value = 'selection';
doc.getElementById('d-dim').value = String(dimIdx);
doc.getElementById('d-meas').value = String(measIdx);
doc.getElementById('d-agg').value = 'sum';
doc.getElementById('d-run').onclick();
var D = S.drivers;
ok('drivers computed', !!D);
eq('mode recorded', S.driverParams.mode, 'selection');
ok('baseline non-empty', D.rowsA.length > 0);
ok('comparison equals the view', D.rowsB.length === S.view.length);

var shownSum = 0;
for (i = 0; i < D.sum.members.length; i++) shownSum += D.sum.members[i].delta;
near('shown members close the waterfall', shownSum, D.sum.delta);
var allSum = 0;
for (i = 0; i < D.sum.allMembers.length; i++) allSum += D.sum.allMembers[i].delta;
near('all members sum to delta', allSum, D.sum.delta);
ok('at most nine bars between the totals', D.sum.members.length <= 9, String(D.sum.members.length));

/* ---------- 6. rendered surface ---------- */
var out = doc.getElementById('drvout');
ok('kpi stats rendered', out.querySelectorAll('.stat').length >= 4);
eq('one waterfall canvas', out.querySelectorAll('canvas').length, 1);
var tbodies = out.querySelectorAll('tbody');
ok('group table rendered', tbodies.length >= 1);
eq('table row per shown member', tbodies[0].querySelectorAll('tr').length, D.sum.members.length);
ok('rows are tappable', tbodies[0].querySelector('tr').className.indexOf('tap') >= 0);
ok('why note present', out.querySelectorAll('.why').length >= 1);

/* row click opens the inspector with the member rows */
tbodies[0].querySelector('tr').onclick();
ok('inspector opened from a group row', doc.getElementById('insveil').className.indexOf('on') >= 0);
var howText = doc.getElementById('ins-how').textContent;
ok('inspector explains the arithmetic', howText.length > 120);
ok('inspector states attribution is not causation', /not causation/i.test(howText));
doc.getElementById('ins-close').onclick();

/* ---------- 7. drawWaterfall directly ---------- */
var wrap = doc.createElement('div');
doc.body.appendChild(wrap);
var cv = doc.createElement('canvas');
wrap.appendChild(cv);
var steps = [
  { label: 'A', value: 100, kind: 'total' },
  { label: 'up', value: 30, kind: 'delta' },
  { label: 'down', value: -50, kind: 'delta' },
  { label: 'B', value: 80, kind: 'total' }
];
var picked = null;
SD.drawWaterfall(cv, { steps: steps, h: 260 }, function (ix) { picked = ix; });
eq('hit region per step', cv._hits.length, 4);
ok('bars filled', CTX.calls.fill >= 4, String(CTX.calls.fill));
ok('connectors stroked', CTX.calls.stroke >= 3, String(CTX.calls.stroke));
ok('labels drawn', CTX.calls.fillText >= 4, String(CTX.calls.fillText));
cv._pick(2);
eq('pick fires with the step index', picked, 2);

CANVAS_OFF = true;
var cv2 = doc.createElement('canvas');
wrap.appendChild(cv2);
var threw = false;
try { SD.drawWaterfall(cv2, { steps: steps, h: 260 }, null); } catch (e) { threw = true; }
ok('drawWaterfall survives a null context', !threw);
CANVAS_OFF = false;

var cv3 = doc.createElement('canvas');
wrap.appendChild(cv3);
threw = false;
try { SD.drawWaterfall(cv3, { steps: [] }, null); } catch (e2) { threw = true; }
ok('drawWaterfall survives no steps', !threw);

/* ---------- 8. average mode, mix rate interaction ---------- */
doc.getElementById('d-agg').value = 'avg';
doc.getElementById('d-run').onclick();
var D2 = S.drivers;
ok('rate decomposition present', !!D2.rate);
near('mix plus rate plus interaction equals the rate change',
  D2.rate.mix + D2.rate.rate + D2.rate.interaction, D2.rate.rateDelta);
var shown2 = 0;
for (i = 0; i < D2.rate.members.length; i++) shown2 += D2.rate.members[i].total;
near('shown rate members close the waterfall', shown2, D2.rate.rateDelta);
var heads = doc.getElementById('drvout').querySelectorAll('thead th');
var headTxt = [];
for (i = 0; i < heads.length; i++) headTxt.push(heads[i].textContent);
ok('rate table shows mix, rate and interaction',
  headTxt.indexOf('Mix') >= 0 && headTxt.indexOf('Rate') >= 0 && headTxt.indexOf('Interaction') >= 0, headTxt.join('|'));

/* ---------- 9. count mode ---------- */
doc.getElementById('d-agg').value = 'count';
doc.getElementById('d-run').onclick();
eq('count mode drops the measure', S.driverParams.measIdx, null);
ok('count mode has no rate block', S.drivers.rate === null);
var cnt = 0;
for (i = 0; i < S.drivers.sum.allMembers.length; i++) cnt += S.drivers.sum.allMembers[i].sumB;
eq('count members recover the classified row count', cnt, S.drivers.sum.classifiedB);

/* ---------- 10. segment mode ---------- */
doc.getElementById('d-agg').value = 'sum';
doc.getElementById('d-mode').value = 'segment';
doc.getElementById('d-mode').onchange();
(function () {
  var dd = doc.getElementById('d-dim'), sd = doc.getElementById('d-sdim'), k;
  if (dd.value === sd.value) {
    for (k = 0; k < dd.options.length; k++) {
      if (dd.options[k].value !== sd.value) { dd.value = dd.options[k].value; break; }
    }
  }
  ok('a split field distinct from the group field is available', dd.value !== sd.value);
})();
eq('segment row shown', doc.getElementById('d-seg').style.display, '');
eq('period row still hidden', doc.getElementById('d-per').style.display, 'none');
ok('segment values populated', doc.getElementById('d-a').options.length > 1);
doc.getElementById('d-a').value = doc.getElementById('d-a').options[0].value;
doc.getElementById('d-b').value = '\u0000other';
doc.getElementById('d-run').onclick();
eq('segment mode recorded', S.driverParams.mode, 'segment');
eq('b label reads as everything else', S.drivers.meta.bLabel, 'everything else');
var segSum = 0;
for (i = 0; i < S.drivers.sum.allMembers.length; i++) segSum += S.drivers.sum.allMembers[i].delta;
near('segment contributions sum to delta', segSum, S.drivers.sum.delta);
ok('segment sides do not overlap', (function () {
  var seen = {}, k;
  for (k = 0; k < S.drivers.rowsA.length; k++) seen[S.drivers.rowsA[k]] = 1;
  for (k = 0; k < S.drivers.rowsB.length; k++) if (seen[S.drivers.rowsB[k]]) return false;
  return true;
})());

/* ---------- 11. period mode ---------- */
doc.getElementById('d-mode').value = 'period';
doc.getElementById('d-mode').onchange();
(function () {
  var dd = doc.getElementById('d-dim'), pd = doc.getElementById('d-pdim'), k;
  if (dd.value === pd.value) {
    for (k = 0; k < dd.options.length; k++) {
      if (dd.options[k].value !== pd.value) { dd.value = dd.options[k].value; break; }
    }
  }
  ok('a split field distinct from the date field is available', dd.value !== pd.value);
})();
eq('period row shown', doc.getElementById('d-per').style.display, '');
ok('date field offered', doc.getElementById('d-pdim').options.length >= 1);
ok('periods offered', doc.getElementById('d-pa').options.length >= 2, String(doc.getElementById('d-pa').options.length));
ok('periods are ordered', (function () {
  var o = doc.getElementById('d-pa').options, prev = -Infinity, k;
  for (k = 0; k < o.length; k++) { var v = +o[k].value; if (v < prev) return false; prev = v; }
  return true;
})());
eq('defaults to the last two periods',
  doc.getElementById('d-pb').value,
  doc.getElementById('d-pb').options[doc.getElementById('d-pb').options.length - 1].value);
doc.getElementById('d-run').onclick();
eq('period mode recorded', S.driverParams.mode, 'period');
ok('period sides both non-empty', S.drivers.rowsA.length > 0 && S.drivers.rowsB.length > 0);
var perSum = 0;
for (i = 0; i < S.drivers.sum.allMembers.length; i++) perSum += S.drivers.sum.allMembers[i].delta;
near('period contributions sum to delta', perSum, S.drivers.sum.delta);

/* ---------- 12. guard rails ---------- */
doc.getElementById('d-mode').value = 'segment';
doc.getElementById('d-mode').onchange();
var before = S.driverParams;
doc.getElementById('d-b').value = doc.getElementById('d-a').value;
doc.getElementById('d-run').onclick();
ok('identical groups are refused', S.driverParams === before);
eq('toast explains the refusal', doc.getElementById('toast').textContent, 'Pick two different groups.');

doc.getElementById('d-mode').value = 'period';
doc.getElementById('d-mode').onchange();
doc.getElementById('d-pb').value = doc.getElementById('d-pa').value;
before = S.driverParams;
doc.getElementById('d-run').onclick();
ok('identical periods are refused', S.driverParams === before);

/* ---------- 13. driverRank ---------- */
doc.getElementById('d-mode').value = 'selection';
doc.getElementById('d-mode').onchange();
doc.getElementById('d-agg').value = 'sum';
doc.getElementById('d-run').onclick();
var ranks = SD.driverRank();
ok('rank list produced', ranks.length >= 1, String(ranks.length));
ok('ranks are sorted by explained variation', (function () {
  for (var k = 1; k < ranks.length; k++) if (ranks[k].eta > ranks[k - 1].eta + 1e-12) return false;
  return true;
})());
ok('every eta sits between zero and one', ranks.every(function (r) { return r.eta >= 0 && r.eta <= 1 + 1e-12; }));

/* ---------- 14. selfCheck ---------- */
var checks = SD.selfCheck();
var drvChecks = checks.filter(function (c) { return /[Dd]river|Mix, rate/.test(c.name); });
eq('three driver checks run', drvChecks.length, 3);
eq('driver checks all pass', drvChecks.filter(function (c) { return !c.ok; }).length, 0,
  drvChecks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));
eq('whole verifier passes', checks.filter(function (c) { return !c.ok; }).length, 0,
  checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));

/* ---------- 15. survives a refresh ---------- */
var keptMode = S.driverParams.mode, keptDim = S.driverParams.dimIdx;
SD.refresh();
ok('drivers survive a refresh', !!S.drivers);
eq('params survive a refresh', S.driverParams.mode + ':' + S.driverParams.dimIdx, keptMode + ':' + keptDim);
eq('selects resynced after refresh', doc.getElementById('d-dim').value, String(keptDim));
ok('output redrawn after refresh', doc.getElementById('drvout').querySelectorAll('canvas').length === 1);

/* ---------- 16. tab switching ---------- */
tabs[6].onclick();
ok('drivers tab active', tabs[6].className.indexOf('on') >= 0);
ok('drivers pane visible', doc.getElementById('pane-drivers').className.indexOf('on') >= 0);
ok('compare pane hidden', doc.getElementById('pane-compare').className.indexOf('on') < 0);

/* ---------- 17. Simpson's paradox dataset ---------- */
var csv = ['segment,period,score'];
function push(seg, per, val, n) { for (var k = 0; k < n; k++) csv.push(seg + ',' + per + ',' + val); }
push('small', 'A', 90, 80);
push('large', 'A', 40, 20);
push('small', 'B', 95, 20);
push('large', 'B', 45, 80);
SD.loadText(csv.join('\n'), 'paradox.csv');
var pIdx = -1, sIdx = -1, mIdx = -1;
for (i = 0; i < S.headers.length; i++) {
  if (S.headers[i] === 'period') pIdx = i;
  if (S.headers[i] === 'segment') sIdx = i;
  if (S.headers[i] === 'score') mIdx = i;
}
var rowsA = [], rowsB = [];
for (i = 0; i < S.view.length; i++) {
  if (String(S.cols[pIdx].vals[S.view[i]]) === 'A') rowsA.push(S.view[i]); else rowsB.push(S.view[i]);
}
var rr = SD.contribRate(rowsA, rowsB, sIdx, mIdx, 'month', 8);
near('paradox mix rate interaction identity', rr.mix + rr.rate + rr.interaction, rr.rateDelta);
ok('pooled average falls', rr.meanB < rr.meanA, rr.meanA + ' -> ' + rr.meanB);
var par = SD.paradoxCheck(rr);
ok('paradox detected', par.detected, JSON.stringify({ d: par.direction, p: par.pooledDirection }));
eq('groups rose', par.direction, 'increase');
eq('pooled fell', par.pooledDirection, 'decrease');

S.driverParams = { mode: 'segment', dimIdx: sIdx, measIdx: mIdx, agg: 'avg', grain: 'month', cap: 8,
  segDimIdx: pIdx, segA: 'A', segB: 'B' };
S.drivers = SD.explain(S.driverParams);
SD.renderDrivers();
var banners = doc.getElementById('drvout').querySelectorAll('.banner');
ok('paradox banner rendered', banners.length >= 1);
ok('banner names the reversal', /moved one way/.test(doc.getElementById('drvout').textContent));

/* ---------- 18. single-member and empty-side degradation ---------- */
var one = SD.contribSum(rowsA, rowsB, pIdx, mIdx, 'month', 8);
ok('single-member dimension still balances', Math.abs(
  one.allMembers.reduce(function (a, m) { return a + m.delta; }, 0) - one.delta) < 1e-9);
var none = SD.contribSum([], rowsB, sIdx, mIdx, 'month', 8);
near('empty baseline gives a pure addition', none.delta, none.totalB);
ok('empty baseline marks everything as an entry',
  none.allMembers.every(function (m) { return m.kind === 'entry'; }));

console.log('');
console.log('passed ' + pass + ', failed ' + fail);
if (fail) { failures.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }

/* ---------- 19. regression: the rest of the desk still works ---------- */
SD.loadText(SD.sampleRetail(), 'retail-orders.csv');
var rdim = -1, rmeas = -1, rdim2 = -1;
for (i = 0; i < S.profile.cols.length; i++) {
  var q = S.profile.cols[i];
  if ((q.type === 'category' || q.type === 'boolean') && q.uniq >= 2 && q.uniq <= 20) { if (rdim < 0) rdim = i; else if (rdim2 < 0) rdim2 = i; }
  if (q.role === 'measure' && q.stat && rmeas < 0) rmeas = i;
}
S.pivotParams = { row: rdim, col: rdim2, meas: rmeas, agg: 'sum', grain: 'month' };
S.pivot = SD.buildPivot(rdim, rdim2, rmeas, 'sum', 'month');
ok('pivot still builds', !!S.pivot && S.pivot.m.length > 0);
var pv = S.profile.cols[rdim];
S.compareParams = { dim: rdim, a: pv.all[0].v, b: '\u0000other' };
S.compare = SD.compareSegments(rdim, pv.all[0].v, '\u0000other');
ok('compare still builds', !!S.compare && S.compare.findings.length > 0);
SD.refresh();
ok('pivot survives refresh', !!S.pivot);
ok('compare survives refresh', !!S.compare);
ok('compare pane still renders', doc.getElementById('cmpout').querySelectorAll('.stat').length >= 4);
ok('pivot pane still renders', doc.getElementById('pivotout').children.length > 0);
var checks2 = SD.selfCheck();
eq('verifier still clean with pivot and compare live',
  checks2.filter(function (c) { return !c.ok; }).length, 0,
  checks2.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));
ok('verifier still runs its full battery', checks2.length >= 10, String(checks2.length));
ok('a new file clears the previous explanation', S.driverParams === null && S.drivers === null);
eq('drivers pane resets to its prompt', doc.getElementById('drvout').querySelectorAll('.empty').length, 1);
var rep = SD.buildReport();
ok('report still builds', typeof rep === 'string' && rep.length > 500);
var wsj = SD.workspaceJSON();
ok('workspace still serialises', typeof wsj === 'string' && wsj.length > 20);
doc.getElementById('help').onclick();
eq('help guide lists every entry', doc.getElementById('help-list').querySelectorAll('.help-item').length, 66);
var catBtns = doc.getElementById('help-cats').querySelectorAll('.val');
var catNames = [];
for (i = 0; i < catBtns.length; i++) catNames.push(catBtns[i].textContent);
ok('Drivers category offered in the guide', catNames.indexOf('Drivers') >= 0, catNames.join('|'));
doc.getElementById('help-close').onclick();

console.log('total passed ' + pass + ', failed ' + fail);
if (fail) { failures.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }

/* ---------- 20. degenerate splits are refused ---------- */
SD.loadText(SD.sampleRetail(), 'retail-orders.csv');
doc.getElementById('d-mode').value = 'segment';
doc.getElementById('d-mode').onchange();
ok('split field differs from the group field by default',
  doc.getElementById('d-dim').value !== doc.getElementById('d-sdim').value,
  doc.getElementById('d-dim').value + ' vs ' + doc.getElementById('d-sdim').value);
doc.getElementById('d-dim').value = doc.getElementById('d-sdim').value;
S.driverParams = null;
doc.getElementById('d-run').onclick();
ok('splitting by the group field is refused', S.driverParams === null);
eq('refusal is explained', doc.getElementById('toast').textContent,
  'Split by a different field from the one defining the two groups.');

doc.getElementById('d-mode').value = 'period';
doc.getElementById('d-mode').onchange();
doc.getElementById('d-dim').value = doc.getElementById('d-pdim').value;
S.driverParams = null;
doc.getElementById('d-run').onclick();
ok('splitting by the date field is refused', S.driverParams === null);
eq('period refusal is explained', doc.getElementById('toast').textContent,
  'Split by a different field from the one defining the two periods.');

console.log('final passed ' + pass + ', failed ' + fail);
if (fail) { failures.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }
