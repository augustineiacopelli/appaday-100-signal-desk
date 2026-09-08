/* Signal Desk session-three forecast surface tests */
var fs = require('fs');
var { JSDOM } = require('jsdom');

var pass = 0, fail = 0, failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function near(name, a, b, tol) {
  tol = tol === undefined ? 1e-9 : tol;
  ok(name, Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), 'got ' + a + ' want ' + b);
}

var html = fs.readFileSync('index.html', 'utf8');
var dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://augustineiacopelli.github.io/appaday-100-signal-desk/' });
var win = dom.window, doc = win.document;

var CTX = null, CANVAS_OFF = false;
function makeCtx() {
  var calls = { fill: 0, stroke: 0, fillText: 0, arc: 0 };
  return {
    calls: calls, canvas: null,
    setTransform: function () {}, clearRect: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, arcTo: function () {}, closePath: function () {},
    rect: function () {}, arc: function () { calls.arc++; }, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}, setLineDash: function () {},
    fill: function () { calls.fill++; }, stroke: function () { calls.stroke++; },
    fillText: function () { calls.fillText++; },
    measureText: function (s) { return { width: String(s).length * 6 }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; }
  };
}
win.HTMLCanvasElement.prototype.getContext = function () {
  if (CANVAS_OFF) return null;
  CTX = makeCtx(); return CTX;
};
Object.defineProperty(win.Element.prototype, 'clientWidth', { get: function () { return 700; }, configurable: true });
Object.defineProperty(win.Element.prototype, 'clientHeight', { get: function () { return 400; }, configurable: true });

doc.dispatchEvent(new win.Event('DOMContentLoaded'));
var SD = win.SignalDesk;
ok('SignalDesk exported', !!SD);

/* ---------- 1. markup ---------- */
var panes = doc.querySelectorAll('.pane');
eq('ten panes', panes.length, 10);
var tipMissing = [];
for (var i = 0; i < panes.length; i++) if (!panes[i].querySelector('.tip')) tipMissing.push(panes[i].id);
eq('every pane carries a tip', tipMissing.join(','), '');
var tabs = doc.querySelectorAll('#tabs .tab');
eq('ten tabs', tabs.length, 10);
eq('forecast tab follows cohorts',
  tabs[7].getAttribute('data-pane') + '>' + tabs[8].getAttribute('data-pane'), 'cohort>forecast');
eq('drivers tab still in place', tabs[6].getAttribute('data-pane'), 'drivers');
eq('briefing still last', tabs[9].getAttribute('data-pane'), 'brief');
['f-dim','f-meas','f-agg','f-grain','f-season','f-model','f-h','f-run','fcout']
  .forEach(function (id) { ok('element ' + id, !!doc.getElementById(id)); });
ok('fcout inside forecast pane', doc.getElementById('pane-forecast').contains(doc.getElementById('fcout')));

/* ---------- 2. help ---------- */
eq('HELP length', SD.HELP.length, 71);
var fh = SD.HELP.filter(function (h) { return h.c === 'Forecast'; });
eq('five Forecast entries', fh.length, 5);
ok('a Forecast entry names the smoothing family',
  fh.some(function (h) { return /Holt-Winters/.test(h.a) && /exponential smoothing/i.test(h.a); }));
ok('a Forecast entry explains the error metrics',
  fh.some(function (h) { return /RMSE/.test(h.a) && /MAPE/.test(h.a) && /MAE/.test(h.a); }));
ok('a Forecast entry states the limits of a projection',
  fh.some(function (h) { return /has not (happened|occurred) yet/.test(h.a); }));
ok('every Forecast entry has q and a', fh.every(function (h) { return h.q && h.a && h.a.length > 80; }));
eq('drivers entries survive', SD.HELP.filter(function (h) { return h.c === 'Drivers'; }).length, 5);

/* ---------- 3. exports ---------- */
['fcExplain','fcBuildSeries','fcCandidates','fcBacktest','fcDecompose','fcScore',
 'fcFitNaive','fcFitSeasonalNaive','fcFitMovingAvg','fcFitLinear','fcFitSES','fcFitHolt','fcFitHW',
 'fcNextBucket','fcSeasonLen','fcHoldoutSize','renderForecast','refreshForecastBuilder',
 'drawForecast','forecastRun'].forEach(function (k) {
  ok('export ' + k, typeof SD[k] === 'function');
});
['explain','contribSum','renderDrivers','drawWaterfall','buildPivot','compareSegments','selfCheck']
  .forEach(function (k) { ok('session-two export ' + k + ' survives', typeof SD[k] === 'function'); });

/* ---------- 4. load data ---------- */
SD.loadText(SD.sampleRetail(), 'retail-orders.csv');
var S = SD.S;
ok('rows loaded', S.rows.length > 200, String(S.rows.length));
ok('date field offered', doc.getElementById('f-dim').options.length >= 1);
ok('measure list has a count option', doc.getElementById('f-meas').options[0].value === '-1');
eq('empty fcout message', doc.getElementById('fcout').querySelectorAll('.empty').length, 1);
eq('forecast state clear on load', S.forecast, null);

/* ---------- 5. run a forecast ---------- */
doc.getElementById('f-agg').value = 'sum';
doc.getElementById('f-grain').value = 'month';
doc.getElementById('f-h').value = '6';
doc.getElementById('f-run').onclick();
var F = S.forecast;
ok('forecast computed', !!F);
ok('not flagged too short', !F.tooShort);
eq('horizon honoured', F.point.length, 6);
eq('one interval bound per point', F.lo.length + '/' + F.hi.length, '6/6');
eq('one timestamp per point', F.times.length, 6);
ok('series has periods', F.series.values.length >= 12, String(F.series.values.length));
ok('a model was chosen', !!F.chosen && !!F.chosen.name);
ok('backtest produced rows', F.backtest.rows.length >= 3, String(F.backtest.rows.length));

/* the grid must be unbroken */
var gridBad = 0;
for (i = 1; i < F.series.times.length; i++) {
  if (SD.fcNextBucket(F.series.times[i - 1], 'month') !== F.series.times[i]) gridBad++;
}
eq('series grid is evenly spaced', gridBad, 0);

/* forecast timestamps continue the grid */
var contBad = 0, prev = F.series.times[F.series.times.length - 1];
for (i = 0; i < F.times.length; i++) {
  if (SD.fcNextBucket(prev, 'month') !== F.times[i]) contBad++;
  prev = F.times[i];
}
eq('forecast periods continue the grid', contBad, 0);

/* ---------- 6. interval discipline ---------- */
var ivBad = 0, prevW = -1;
for (i = 0; i < F.point.length; i++) {
  if (!(F.lo[i] <= F.point[i] + 1e-9 && F.point[i] <= F.hi[i] + 1e-9)) ivBad++;
  var w = F.hi[i] - F.lo[i];
  if (w < prevW - 1e-9) ivBad++;
  prevW = w;
}
eq('intervals contain the point and never narrow', ivBad, 0);
ok('interval widens across the horizon', (F.hi[5] - F.lo[5]) > (F.hi[0] - F.lo[0]));

/* ---------- 7. backtest is honest ---------- */
var bt = F.backtest;
eq('train plus holdout equals the series', bt.trainN + bt.k, F.series.values.length);
ok('holdout is at least two periods', bt.k >= 2, String(bt.k));
ok('holdout is at most a third', bt.k <= Math.floor(F.series.values.length / 3), String(bt.k));
ok('backtest rows sorted by rmse', (function () {
  for (var q = 1; q < bt.rows.length; q++) if (bt.rows[q].rmse < bt.rows[q - 1].rmse - 1e-12) return false;
  return true;
})());
ok('naive is always among the candidates', bt.rows.some(function (r) { return r.key === 'naive'; }));
eq('auto pick selects the lowest rmse', F.chosen.key, bt.rows[0].key);
var scoreBad = 0;
for (i = 0; i < bt.rows.length; i++) {
  var rw = bt.rows[i], ae = 0, se = 0;
  for (var j = 0; j < bt.test.length; j++) { var e = bt.test[j] - rw.pred[j]; ae += Math.abs(e); se += e * e; }
  if (Math.abs(ae / bt.test.length - rw.mae) > 1e-9) scoreBad++;
  if (Math.abs(Math.sqrt(se / bt.test.length) - rw.rmse) > 1e-9) scoreBad++;
}
eq('every holdout score reproduces independently', scoreBad, 0);

/* ---------- 8. rendered surface ---------- */
var out = doc.getElementById('fcout');
ok('kpi stats rendered', out.querySelectorAll('.stat').length >= 5);
eq('one forecast canvas among the cards', out.querySelectorAll('.card canvas').length >= 1, true);
var tbodies = out.querySelectorAll('tbody');
ok('projection and scoreboard tables rendered', tbodies.length >= 2, String(tbodies.length));
eq('one row per projected period', tbodies[0].querySelectorAll('tr').length, 6);
eq('one row per scored method', tbodies[1].querySelectorAll('tr').length, bt.rows.length);
ok('rows are tappable', tbodies[0].querySelector('tr').className.indexOf('tap') >= 0);
ok('why notes present', out.querySelectorAll('.why').length >= 2);
ok('the limits of a forecast are stated on the surface',
  /cannot see a price change/.test(out.textContent));

/* row click opens the inspector on a projected period */
tbodies[0].querySelector('tr').onclick();
ok('inspector opened from a projected period', doc.getElementById('insveil').className.indexOf('on') >= 0);
var howText = doc.getElementById('ins-how').textContent;
ok('inspector says the period has not happened', /has not happened/.test(howText));
ok('inspector explains the interval', /95 percent interval/.test(howText));
doc.getElementById('ins-close').onclick();

/* model row opens the backtest detail */
tbodies[1].querySelector('tr').onclick();
ok('inspector opened from a model row', doc.getElementById('insveil').className.indexOf('on') >= 0);
ok('inspector explains the holdout', /hidden from it/.test(doc.getElementById('ins-how').textContent));
doc.getElementById('ins-close').onclick();

/* ---------- 9. drawForecast directly ---------- */
var wrap = doc.createElement('div');
doc.body.appendChild(wrap);
var cv = doc.createElement('canvas');
wrap.appendChild(cv);
var picked = null;
SD.drawForecast(cv, { hist: [10, 12, 11, 14], fitted: [null, 10, 12, 11],
  point: [15, 16], lo: [12, 12], hi: [18, 20], labels: ['a','b','c','d','e','f'], h: 260,
  pick: function (ix) { picked = ix; } });
eq('hit region per period', cv._hits.length, 6);
ok('band and markers filled', CTX.calls.fill >= 2, String(CTX.calls.fill));
ok('lines stroked', CTX.calls.stroke >= 3, String(CTX.calls.stroke));
ok('labels drawn', CTX.calls.fillText >= 2, String(CTX.calls.fillText));
cv._pick(4);
eq('pick fires with the period index', picked, 4);

CANVAS_OFF = true;
var cv2 = doc.createElement('canvas'); wrap.appendChild(cv2);
var threw = false;
try { SD.drawForecast(cv2, { hist: [1,2], point: [3], lo: [2], hi: [4], labels: ['a','b','c'] }); }
catch (e2) { threw = true; }
ok('drawForecast survives a null context', !threw);
CANVAS_OFF = false;

var cv3 = doc.createElement('canvas'); wrap.appendChild(cv3);
threw = false;
try { SD.drawForecast(cv3, { hist: [], point: [], lo: [], hi: [], labels: [] }); } catch (e3) { threw = true; }
ok('drawForecast survives an empty series', !threw);

/* ---------- 10. method override ---------- */
doc.getElementById('f-model').value = 'linear';
doc.getElementById('f-run').onclick();
eq('override honoured', S.forecast.chosen.key, 'linear');
eq('override recorded in params', S.forecastParams.model, 'linear');
ok('override clears the auto flag', S.forecast.autoPick === false);
ok('linear projection is a straight line', (function () {
  var p = S.forecast.point, d = p[1] - p[0], q;
  for (q = 2; q < p.length; q++) if (Math.abs((p[q] - p[q - 1]) - d) > 1e-6) return false;
  return true;
})());

/* an ineligible method falls back rather than breaking */
doc.getElementById('f-model').value = 'hw';
doc.getElementById('f-season').value = '12';
doc.getElementById('f-run').onclick();
ok('ineligible method falls back', S.forecast.fellBack === true || S.forecast.chosen.key === 'hw');
ok('a forecast still came back', S.forecast.point.length > 0);

/* a shorter season lets Holt-Winters run */
doc.getElementById('f-season').value = '4';
doc.getElementById('f-run').onclick();
ok('Holt-Winters runs at season 4', S.forecast.chosen.key === 'hw', S.forecast.chosen.key);
eq('season length recorded', S.forecast.m, 4);
ok('seasonal params fitted', S.forecast.chosen.params.gamma > 0 && S.forecast.chosen.params.gamma < 1);

/* ---------- 11. decomposition ---------- */
ok('decomposition built at season 4', !!S.forecast.decomp);
var D = S.forecast.decomp;
var recBad = 0, yv = S.forecast.series.values;
for (i = 0; i < yv.length; i++) {
  if (D.trend[i] === null) continue;
  if (Math.abs(D.trend[i] + D.season[i] + D.resid[i] - yv[i]) > 1e-6) recBad++;
}
eq('trend plus season plus residual reconstructs the series', recBad, 0);
var ssum = 0;
for (i = 0; i < D.seasonal.length; i++) ssum += D.seasonal[i];
near('seasonal indices centre on zero', ssum, 0, 1e-9);
ok('residual share is a proportion', D.residShare >= 0 && D.residShare <= 1.0001, String(D.residShare));

/* ---------- 12. count and average modes ---------- */
doc.getElementById('f-model').value = 'auto';
doc.getElementById('f-season').value = 'auto';
doc.getElementById('f-agg').value = 'count';
doc.getElementById('f-run').onclick();
eq('count mode drops the measure', S.forecastParams.measIdx, null);
ok('count series is whole numbers', S.forecast.series.values.every(function (v) { return v === Math.round(v); }));

doc.getElementById('f-agg').value = 'avg';
doc.getElementById('f-run').onclick();
ok('average mode forecasts', !!S.forecast && !S.forecast.tooShort);
ok('average series has no nulls left', S.forecast.series.values.every(function (v) { return v !== null && isFinite(v); }));

/* ---------- 13. guard rails ---------- */
doc.getElementById('f-agg').value = 'sum';
doc.getElementById('f-meas').value = '-1';
var beforeP = S.forecastParams;
doc.getElementById('f-run').onclick();
ok('a total with no measure is refused', S.forecastParams === beforeP);
eq('refusal is explained', doc.getElementById('toast').textContent,
  'Pick a measure, or switch the aggregate to Count.');

/* a grain too coarse yields too few periods and says so */
var measOpt = doc.getElementById('f-meas').options[1].value;
doc.getElementById('f-meas').value = measOpt;
doc.getElementById('f-grain').value = 'year';
doc.getElementById('f-run').onclick();
ok('a two-year span is flagged too short rather than forecast', S.forecast.tooShort === true);
ok('the too-short banner is rendered', doc.getElementById('fcout').querySelectorAll('.banner').length >= 1);
ok('the banner explains the remedy', /finer grain/.test(doc.getElementById('fcout').textContent));

/* ---------- 14. selfCheck ---------- */
doc.getElementById('f-grain').value = 'month';
doc.getElementById('f-run').onclick();
var checks = SD.selfCheck();
var fcChecks = checks.filter(function (c) { return /[Ff]orecast|Prediction interval|selected model/.test(c.name); });
eq('four forecast checks run', fcChecks.length, 4);
eq('forecast checks all pass', fcChecks.filter(function (c) { return !c.ok; }).length, 0,
  fcChecks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));
eq('whole verifier passes', checks.filter(function (c) { return !c.ok; }).length, 0,
  checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));
ok('verifier ran its full battery', checks.length >= 14, String(checks.length));

/* ---------- 15. survives a refresh ---------- */
var keptKey = S.forecast.chosen.key, keptDim = S.forecastParams.dateIdx;
SD.refresh();
ok('forecast survives a refresh', !!S.forecast);
eq('params survive a refresh', S.forecastParams.dateIdx, keptDim);
eq('selects resynced after refresh', doc.getElementById('f-dim').value, String(keptDim));
ok('output redrawn after refresh', doc.getElementById('fcout').querySelectorAll('.stat').length >= 5);

/* ---------- 16. filters recompute the forecast ---------- */
var catIdx = -1, catVal = null;
for (i = 0; i < S.profile.cols.length; i++) {
  var pc = S.profile.cols[i];
  if ((pc.type === 'category' || pc.type === 'boolean') && pc.uniq >= 3 && pc.uniq <= 12) {
    catIdx = i; catVal = (pc.all || pc.top)[0].v; break;
  }
}
ok('found a category to filter on', catIdx >= 0);
var beforeNext = S.forecast.point[0];
S.filters[catIdx] = { kind: 'cat', set: {} };
S.filters[catIdx].set[String(catVal)] = 1;
SD.applyFilters();
ok('forecast recomputed under a filter', !!S.forecast);
ok('the projection actually changed', S.forecast.point[0] !== beforeNext);
var checksF = SD.selfCheck();
eq('verifier still clean under a filter', checksF.filter(function (c) { return !c.ok; }).length, 0,
  checksF.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));

/* ---------- 17. tab switching ---------- */
tabs[8].onclick();
ok('forecast tab active', tabs[8].className.indexOf('on') >= 0);
ok('forecast pane visible', doc.getElementById('pane-forecast').className.indexOf('on') >= 0);
ok('cohort pane hidden', doc.getElementById('pane-cohort').className.indexOf('on') < 0);

/* ---------- 18. regression: the rest of the desk still works ---------- */
SD.loadText(SD.sampleRetail(), 'retail-orders.csv');
ok('a new file clears the previous forecast', S.forecast === null && S.forecastParams === null);
eq('forecast pane resets to its prompt', doc.getElementById('fcout').querySelectorAll('.empty').length, 1);
var rdim = -1, rmeas = -1, rdim2 = -1;
for (i = 0; i < S.profile.cols.length; i++) {
  var q2 = S.profile.cols[i];
  if ((q2.type === 'category' || q2.type === 'boolean') && q2.uniq >= 2 && q2.uniq <= 20) {
    if (rdim < 0) rdim = i; else if (rdim2 < 0) rdim2 = i;
  }
  if (q2.role === 'measure' && q2.stat && rmeas < 0) rmeas = i;
}
S.pivotParams = { row: rdim, col: rdim2, meas: rmeas, agg: 'sum', grain: 'month' };
S.pivot = SD.buildPivot(rdim, rdim2, rmeas, 'sum', 'month');
ok('pivot still builds', !!S.pivot && S.pivot.m.length > 0);
var pv = S.profile.cols[rdim];
S.compareParams = { dim: rdim, a: pv.all[0].v, b: '\u0000other' };
S.compare = SD.compareSegments(rdim, pv.all[0].v, '\u0000other');
ok('compare still builds', !!S.compare && S.compare.findings.length > 0);
S.driverParams = { mode: 'selection', dimIdx: rdim, measIdx: rmeas, agg: 'sum', grain: 'month', cap: 8 };
S.drivers = SD.explain(S.driverParams);
ok('drivers still build', !!S.drivers && !!S.drivers.sum);
var dsum = 0;
for (i = 0; i < S.drivers.sum.allMembers.length; i++) dsum += S.drivers.sum.allMembers[i].delta;
near('driver contributions still close', dsum, S.drivers.sum.delta);
SD.refresh();
ok('pivot survives refresh', !!S.pivot);
ok('compare survives refresh', !!S.compare);
ok('drivers survive refresh', !!S.drivers);
ok('drivers pane still renders', doc.getElementById('drvout').querySelectorAll('.stat').length >= 4);
ok('compare pane still renders', doc.getElementById('cmpout').querySelectorAll('.stat').length >= 4);
ok('pivot pane still renders', doc.getElementById('pivotout').children.length > 0);
var checks2 = SD.selfCheck();
eq('verifier clean with every surface live',
  checks2.filter(function (c) { return !c.ok; }).length, 0,
  checks2.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('|'));

/* report and workspace round-trip */
doc.getElementById('f-meas').value = doc.getElementById('f-meas').options[1].value;
doc.getElementById('f-run').onclick();
var rep = SD.buildReport();
ok('report still builds', typeof rep === 'string' && rep.length > 500);
ok('report carries a forecast section', rep.indexOf('## Forecast') >= 0);
ok('report names the selected method', rep.indexOf('(selected)') >= 0);
var wsj = SD.workspaceJSON();
ok('workspace still serialises', typeof wsj === 'string' && wsj.length > 20);
var parsed = JSON.parse(wsj);
ok('workspace carries the forecast setup', !!parsed.forecast && parsed.forecast.dateIdx !== undefined);
ok('workspace carries the driver setup', !!parsed.drivers);

doc.getElementById('help').onclick();
eq('help guide lists every entry', doc.getElementById('help-list').querySelectorAll('.help-item').length, 75);
var catBtns = doc.getElementById('help-cats').querySelectorAll('.val'), catNames = [];
for (i = 0; i < catBtns.length; i++) catNames.push(catBtns[i].textContent);
ok('Forecast category offered in the guide', catNames.indexOf('Forecast') >= 0, catNames.join('|'));
ok('Drivers category still offered', catNames.indexOf('Drivers') >= 0);
doc.getElementById('help-close').onclick();

console.log('');
console.log('passed ' + pass + ', failed ' + fail);
if (fail) { failures.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }
