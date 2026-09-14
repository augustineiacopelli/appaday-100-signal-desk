/* Signal Desk composition and reversal checks: math plus surface tests.
   Run with: npm install jsdom && node ssq-test.js  (index.html in same directory) */
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

win.HTMLCanvasElement.prototype.getContext = function () {
  return {
    canvas: null, setTransform: function () {}, clearRect: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, arcTo: function () {}, closePath: function () {},
    rect: function () {}, arc: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}, setLineDash: function () {},
    fill: function () {}, stroke: function () {}, fillText: function () {},
    measureText: function (s) { return { width: String(s).length * 6 }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; }
  };
};
Object.defineProperty(win.Element.prototype, 'clientWidth', { get: function () { return 700; }, configurable: true });
Object.defineProperty(win.Element.prototype, 'clientHeight', { get: function () { return 400; }, configurable: true });

doc.dispatchEvent(new win.Event('DOMContentLoaded'));
var SD = win.SignalDesk;
ok('SignalDesk exported', !!SD);

/* ---------- 1. exports ---------- */
['ssqOpt', 'ssqSide', 'ssqCompareOn', 'ssqEligibleDims', 'ssqScan', 'pivotReversal',
 'ssqWord', 'ssqCard', 'insSsq', 'paradoxCheck'].forEach(function (k) {
  ok('export ' + k, typeof SD[k] === 'function');
});
ok('SSQ_DEF exported', !!SD.SSQ_DEF && SD.SSQ_DEF.minLevels === 2);

/* ---------- 2. the textbook fixture ----------
   Ward A takes mostly mild cases, Ward B mostly severe.
   Within each severity B beats A by exactly 5. Pooled, A beats B by exactly 27.

     mild   A: 90 rows, mean 90     B: 10 rows, mean 95
     severe A: 10 rows, mean 50     B: 90 rows, mean 55

   pooled A = (90*90 + 10*50)/100 = 86
   pooled B = (10*95 + 90*55)/100 = 59
   pooled delta (B - A)           = -27
   pooled weights: mild (90+10)/200 = 0.5, severe (10+90)/200 = 0.5
   standardized A = .5*90 + .5*50  = 70
   standardized B = .5*95 + .5*55  = 75
   standardized delta (B - A)      = +5
------------------------------------------------------------------ */
function block(ward, sev, n, mean, tag) {
  var out = [], i;
  for (i = 0; i < n; i++) out.push([ward, sev, (i % 2 ? mean + 1 : mean - 1), tag[i % tag.length]].join(','));
  return out;
}
var TAGS = ['red', 'blue', 'green', 'grey'];
var rows = ['ward,severity,score,tag']
  .concat(block('Ward A', 'mild', 90, 90, TAGS))
  .concat(block('Ward A', 'severe', 10, 50, TAGS))
  .concat(block('Ward B', 'mild', 10, 95, TAGS))
  .concat(block('Ward B', 'severe', 90, 55, TAGS));
SD.loadText(rows.join('\n'), 'wards.csv');
var S = SD.S;
eq('fixture rows loaded', S.rows.length, 200);

function colIdx(name) {
  for (var i = 0; i < S.profile.cols.length; i++) if (S.profile.cols[i].name === name) return S.profile.cols[i].idx;
  return -1;
}
var WARD = colIdx('ward'), SEV = colIdx('severity'), SCORE = colIdx('score'), TAG = colIdx('tag');
ok('ward is a category', S.profile.cols[WARD].type === 'category', S.profile.cols[WARD].type);
ok('severity is a category', S.profile.cols[SEV].type === 'category', S.profile.cols[SEV].type);
ok('score is a measure', S.profile.cols[SCORE].role === 'measure', S.profile.cols[SCORE].role);

function rowsWhere(fn) {
  var out = [], i;
  for (i = 0; i < S.rows.length; i++) if (fn(i)) out.push(i);
  return out;
}
var A = rowsWhere(function (r) { return S.cols[WARD].vals[r] === 'Ward A'; });
var B = rowsWhere(function (r) { return S.cols[WARD].vals[r] === 'Ward B'; });
eq('Ward A row count', A.length, 100);
eq('Ward B row count', B.length, 100);

/* ---------- 3. the arithmetic, pinned to hand-computed values ---------- */
var H = SD.ssqCompareOn(A, B, SEV, SCORE, SD.ssqOpt({ labels: { base: 'Ward A', comp: 'Ward B' } }));
ok('check ran', H.ok, H.reason);
near('raw baseline is 86', H.rawA, 86);
near('raw comparison is 59', H.rawB, 59);
near('raw delta is -27', H.rawDelta, -27);
near('standardized baseline is 70', H.stdA, 70);
near('standardized comparison is 75', H.stdB, 75);
near('standardized delta is +5', H.stdDelta, 5);
eq('two shared levels', H.sharedLevels, 2);
eq('two levels tested', H.testedLevels, 2);
eq('both levels rose', H.up, 2);
eq('no level fell', H.down, 0);
eq('no level flat', H.flat, 0);
near('coverage of baseline is total', H.coverA, 1);
near('coverage of comparison is total', H.coverB, 1);
ok('every level moves against the headline', H.allAgainst);
ok('standardizing flips the sign', H.flips);
eq('verdict is a full reversal', H.reversal, 'full');
near('all weight moves against the headline', H.weightAgainst, 1);
eq('labels carried through', H.baseLabel + '>' + H.compLabel, 'Ward A>Ward B');

var wsum = 0, i;
for (i = 0; i < H.levels.length; i++) wsum += H.levels[i].wPool;
near('pooled weights sum to one', wsum, 1);
for (i = 0; i < H.levels.length; i++) {
  near('level weight is half for ' + H.levels[i].label, H.levels[i].wPool, 0.5);
  near('level gap is +5 for ' + H.levels[i].label, H.levels[i].delta, 5);
}
ok('standardized baseline sits inside its level means',
  H.stdA >= Math.min(H.levels[0].meanA, H.levels[1].meanA) && H.stdA <= Math.max(H.levels[0].meanA, H.levels[1].meanA));

/* ---------- 4. symmetry ---------- */
var R = SD.ssqCompareOn(B, A, SEV, SCORE, SD.ssqOpt());
near('swapping sides negates the raw delta', R.rawDelta, 27);
near('swapping sides negates the standardized delta', R.stdDelta, -5);
eq('swapping sides keeps the verdict', R.reversal, 'full');
eq('swapping sides flips the direction counts', R.down, 2);

/* ---------- 5. guards ---------- */
var g1 = SD.ssqCompareOn(A, B, SEV, SCORE, SD.ssqOpt({ minCell: 200 }));
ok('refuses when no level clears the cell minimum', !g1.ok);
ok('names the cell minimum in the refusal', /at least 200 rows/.test(g1.reason), g1.reason);
var g2 = SD.ssqCompareOn(A, B, SEV, SCORE, SD.ssqOpt({ maxLevels: 1 }));
ok('refuses when the field has too many values', !g2.ok);
ok('names the ceiling in the refusal', /ceiling of 1/.test(g2.reason), g2.reason);
var g5 = SD.ssqCompareOn([], B, SEV, SCORE, SD.ssqOpt());
var g3 = SD.ssqCompareOn(A, B, SEV, SCORE, SD.ssqOpt({ minCell: 50 }));
ok('refuses when too few values clear the cell minimum', !g3.ok, g3.reason);
ok('that refusal reads differently from the empty-side one',
  g3.reason !== g5.reason && /fewer than 2 values/.test(g3.reason), g3.reason);
var g4 = SD.ssqCompareOn(A, B, SEV, null, SD.ssqOpt());
ok('refuses with no numeric measure', !g4.ok);
ok('refuses on an empty side', !g5.ok);

/* a coverage refusal needs two testable values that still miss most of the file */
var thin = ['grp,band,val']
  .concat(block('one', 'p', 30, 10, TAGS)).concat(block('two', 'p', 30, 12, TAGS))
  .concat(block('one', 'q', 30, 10, TAGS)).concat(block('two', 'q', 30, 12, TAGS))
  .concat(block('one', 'r', 140, 10, TAGS)).concat(block('two', 'r', 2, 12, TAGS));
thin = thin.map(function (ln, ix) { return ix === 0 ? 'grp,band,val,tag' : ln; });
SD.loadText(thin.join('\n'), 'thin.csv');
var St = SD.S;
function tIdx(nm) { for (var q = 0; q < St.profile.cols.length; q++) if (St.profile.cols[q].name === nm) return St.profile.cols[q].idx; return -1; }
var GRP = tIdx('grp'), BAND = tIdx('band'), VAL = tIdx('val');
var tA = [], tB = [], q;
for (q = 0; q < St.rows.length; q++) (St.cols[GRP].vals[q] === 'one' ? tA : tB).push(q);
var g6 = SD.ssqCompareOn(tA, tB, BAND, VAL, SD.ssqOpt({ minCell: 10 }));
ok('refuses when the testable values cover too little of a side', !g6.ok, g6.reason);
ok('the coverage refusal says so in those terms', /cover only/.test(g6.reason), g6.reason);
var g7 = SD.ssqCompareOn(tA, tB, BAND, VAL, SD.ssqOpt({ minCell: 1 }));
ok('lowering the cell minimum lets the same field through', g7.ok, g7.reason);
SD.loadText(rows.join('\n'), 'wards.csv');
S = SD.S;
WARD = colIdx('ward'); SEV = colIdx('severity'); SCORE = colIdx('score'); TAG = colIdx('tag');
A = rowsWhere(function (r) { return S.cols[WARD].vals[r] === 'Ward A'; });
B = rowsWhere(function (r) { return S.cols[WARD].vals[r] === 'Ward B'; });
ok('a refusal always carries a reason',
  [g1, g2, g3, g4, g5, g6].every(function (g) { return typeof g.reason === 'string' && g.reason.length > 10; }));
ok('a refusal never claims a reversal',
  [g1, g2, g3, g4, g5, g6].every(function (g) { return g.reversal === 'none'; }));
ok('every refusal path gives a distinct message',
  (function () { var seen = {}, list = [g1, g2, g3, g4, g5, g6], n = 0, z;
    for (z = 0; z < list.length; z++) if (!seen[list[z].reason]) { seen[list[z].reason] = 1; n++; }
    return n >= 5; })());

/* ---------- 6. the scan finds what the split field missed ---------- */
var scan = SD.ssqScan(A, B, SCORE, WARD, SD.ssqOpt());
ok('scan checked at least one field', scan.checked >= 1, String(scan.checked));
ok('scan found the reversal', scan.found >= 1, String(scan.found));
eq('severity is the top hit', scan.hits[0].dimName, 'severity');
eq('top hit is a full reversal', scan.hits[0].reversal, 'full');
ok('scan never returns the split field',
  scan.hits.concat(scan.skipped).every(function (h) { return h.dimIdx !== WARD; }));
ok('scan never returns the measure',
  scan.hits.concat(scan.skipped).every(function (h) { return h.dimIdx !== SCORE; }));
ok('the noise tag column did not produce a reversal',
  !scan.hits.some(function (h) { return h.dimName === 'tag'; }));
var eligible = SD.ssqEligibleDims(WARD, SCORE, SD.ssqOpt());
ok('eligible dims exclude the split field and the measure',
  eligible.indexOf(WARD) < 0 && eligible.indexOf(SCORE) < 0);
ok('hits are ordered by severity',
  scan.hits.every(function (h, ix) { return ix === 0 || scan.hits[ix - 1].severity >= h.severity; }));

/* ---------- 7. a control with equal composition must not fire ---------- */
var rows2 = ['ward,severity,score,tag']
  .concat(block('Ward A', 'mild', 50, 90, TAGS))
  .concat(block('Ward A', 'severe', 50, 50, TAGS))
  .concat(block('Ward B', 'mild', 50, 95, TAGS))
  .concat(block('Ward B', 'severe', 50, 55, TAGS));
SD.loadText(rows2.join('\n'), 'wards-balanced.csv');
S = SD.S;
WARD = colIdx('ward'); SEV = colIdx('severity'); SCORE = colIdx('score');
var A2 = rowsWhere(function (r) { return S.cols[WARD].vals[r] === 'Ward A'; });
var B2 = rowsWhere(function (r) { return S.cols[WARD].vals[r] === 'Ward B'; });
var C = SD.ssqCompareOn(A2, B2, SEV, SCORE, SD.ssqOpt());
ok('balanced control ran', C.ok, C.reason);
near('balanced raw delta is +5', C.rawDelta, 5);
near('balanced standardized delta is also +5', C.stdDelta, 5);
near('with equal mix the two figures agree exactly', C.stdDelta, C.rawDelta);
eq('balanced control reports no reversal', C.reversal, 'none');
near('no weight moves against the headline', C.weightAgainst, 0);
var scan2 = SD.ssqScan(A2, B2, SCORE, WARD, SD.ssqOpt());
eq('balanced control scan finds nothing', scan2.found, 0);

/* ---------- 8. pivot margins ---------- */
SD.loadText(rows.join('\n'), 'wards.csv');
S = SD.S;
WARD = colIdx('ward'); SEV = colIdx('severity'); SCORE = colIdx('score');
var Pavg = SD.buildPivot(WARD, SEV, SCORE, 'avg', 'month');
var PR = SD.pivotReversal(Pavg);
ok('pivot check ran on an average', PR.ok, PR.reason);
eq('both row margins tested', PR.rows.length, 2);
eq('both column margins tested', PR.cols.length, 2);
ok('a row pair swaps order once the mix is held equal', PR.rowFlips.length >= 1, String(PR.rowFlips.length));
var fl = PR.rowFlips[0];
ok('the flip really does reverse sign',
  (fl.rawGap > 0) !== (fl.stdGap > 0), 'raw ' + fl.rawGap + ' std ' + fl.stdGap);
ok('reweighted margins sit inside their own cell averages',
  PR.rows.concat(PR.cols).every(function (b) { return b.std >= 50 - 1e-9 && b.std <= 95 + 1e-9; }));
var Psum = SD.buildPivot(WARD, SEV, SCORE, 'sum', 'month');
ok('pivot check refuses a total', !SD.pivotReversal(Psum).ok);
ok('the refusal explains why totals cannot reverse',
  /only averages/.test(SD.pivotReversal(Psum).reason));
var Pcnt = SD.buildPivot(WARD, SEV, SCORE, 'count', 'month');
ok('pivot check refuses a count', !SD.pivotReversal(Pcnt).ok);

/* ---------- 9. paradoxCheck, tightened ---------- */
var ex = SD.explain({ mode: 'segment', segDimIdx: WARD, segA: 'Ward A', segB: 'Ward B',
  dimIdx: SEV, measIdx: SCORE, agg: 'avg', grain: 'month', cap: 8 });
ok('explain returned a rate decomposition', !!ex.rate);
ok('explain returned a paradox check', !!ex.paradox);
ok('explain returned a standardization', !!ex.std && ex.std.ok);
ok('explain returned a scan', !!ex.scan);
ok('paradox detected on the fixture', ex.paradox.detected, JSON.stringify(ex.paradox.reason));
eq('paradox direction is the group direction', ex.paradox.direction, 'increase');
eq('paradox pooled direction opposes it', ex.paradox.pooledDirection, 'decrease');
eq('both groups counted as rising', ex.paradox.groupsUp, 2);
ok('the check reports whether its pooled figure is the headline',
  typeof ex.paradox.headlineIsPooled === 'boolean');
ok('with no entries or exits the pooled figure is the headline', ex.paradox.headlineIsPooled);
near('mix, rate and interaction still close', ex.rate.mix + ex.rate.rate + ex.rate.interaction, ex.rate.rateDelta);
var tight = SD.paradoxCheck(ex.rate, 500);
ok('a raised cell minimum suppresses the finding', !tight.detected);
ok('the suppressed check names the minimum', /minimum of 500/.test(tight.reason), tight.reason);
eq('the suppressed check counts the small groups', tight.smallGroups, 2);
var loose = SD.paradoxCheck(ex.rate, 0);
ok('a zero minimum still detects it', loose.detected);

/* ---------- 10. drivers surface ---------- */
function pick(id, val) {
  var sel = doc.getElementById(id), k;
  for (k = 0; k < sel.options.length; k++) if (sel.options[k].value === String(val)) { sel.selectedIndex = k; return true; }
  sel.value = String(val);
  return sel.value === String(val);
}
doc.getElementById('d-mode').value = 'segment';
doc.getElementById('d-mode').onchange();
eq('segment builder revealed', doc.getElementById('d-seg').style.display, '');
ok('group field set', pick('d-sdim', WARD));
doc.getElementById('d-sdim').onchange();
ok('group A set', pick('d-a', 'Ward A'));
ok('group B set', pick('d-b', 'Ward B'));
ok('split field set', pick('d-dim', SEV));
ok('measure set', pick('d-meas', SCORE));
doc.getElementById('d-agg').value = 'avg';
doc.getElementById('d-run').onclick();
var D = S.drivers;
ok('drivers built through the surface', !!D);
if (D && D.std) {
  var out = doc.getElementById('drvout');
  var banners = out.querySelectorAll('.banner');
  ok('a reversal banner rendered', banners.length >= 1, String(banners.length));
  ok('the surface names the composition check',
    /mix held equal/i.test(out.textContent) || /held equal/i.test(out.textContent));
  ok('the surface refuses to pick a number for you',
    /Neither number is the true one|does not make that judgment/i.test(out.textContent));
  ok('the surface discloses what it scanned',
    /Checked|checked/.test(out.textContent));
}

/* ---------- 11. verifier ---------- */
var checks = SD.selfCheck();
ok('verifier ran its full battery', checks.length >= 16, String(checks.length));
var failed = checks.filter(function (c) { return !c.ok; });
ok('every verifier check passes', failed.length === 0,
  failed.map(function (c) { return c.name; }).join('; '));
ok('the verifier now covers standardization weights',
  checks.some(function (c) { return /weights sum to one/i.test(c.name); }));
ok('the verifier now covers standardized bounds',
  checks.some(function (c) { return /inside the group averages/i.test(c.name); }));
ok('the verifier re-tests every flagged reversal',
  checks.some(function (c) { return /flagged reversal/i.test(c.name); }));

/* ---------- 12. report and briefing payload ---------- */
var pay = SD.briefPayload();
ok('payload carries the composition checks', !!pay.compositionChecks);
if (pay.compositionChecks) {
  ok('payload names the method', /standardization/i.test(pay.compositionChecks.method));
  ok('payload refuses to rank the two figures', /Neither is the true one/i.test(pay.compositionChecks.note));
  ok('payload lists at least the split field', pay.compositionChecks.checks.length >= 1);
  ok('payload carries both figures per check',
    pay.compositionChecks.checks.every(function (c) {
      return typeof c.headlineChange === 'number' && typeof c.changeWithMixHeldEqual === 'number';
    }));
}
ok('payload still carries mix, rate and interaction',
  !!(pay.changeDecomposition && pay.changeDecomposition.mixRateInteraction));

/* ---------- 13. help ---------- */
eq('HELP length', SD.HELP.length, 80);
var comp = SD.HELP.filter(function (h) { return h.c === 'Composition'; });
eq('five Composition entries', comp.length, 5);
ok('a Composition entry names the paradox',
  comp.some(function (h) { return /paradox/i.test(h.q) || /paradox/i.test(h.a); }));
ok('a Composition entry explains the guards',
  comp.some(function (h) { return /minimum group size/i.test(h.a) || /refuse/i.test(h.q); }));
ok('a Composition entry declines to choose for the reader',
  comp.some(function (h) { return /will not answer it for you|causal judgment|common cause/i.test(h.a); }));
ok('every Composition entry is substantive',
  comp.every(function (h) { return h.q && h.a && h.a.length > 120; }));

/* ---------- 14. no forbidden APIs or stray characters ---------- */
ok('no ctx.roundRect', html.indexOf('ctx.roundRect') < 0);
ok('no ctx.ellipse', html.indexOf('ctx.ellipse') < 0);
ok('no window.confirm', html.indexOf('window.confirm') < 0);
ok('source is ASCII clean', !/[^\x00-\x7F]/.test(html));
eq('exactly two portfolio backlinks',
  (html.match(/https:\/\/augustineiacopelli\.github\.io\/appaday\//g) || []).length, 2);

/* ---------- report ---------- */
console.log('\npass ' + pass + '  fail ' + fail);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
