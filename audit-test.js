/* Signal Desk audit suite: data-processing fixes and the Where to look first ranking.
   Run with: npm install jsdom && node audit-test.js  (index.html in same directory) */
var fs = require('fs');
var { JSDOM } = require('jsdom');

var pass = 0, fail = 0, failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function near(name, a, b, tol) {
  tol = tol === undefined ? 1e-9 : tol;
  ok(name, a !== null && a !== undefined && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), 'got ' + a + ' want ' + b);
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
win.scrollTo = function () {};
doc.dispatchEvent(new win.Event('DOMContentLoaded'));
var SD = win.SignalDesk;
function day(ms) { return ms === null ? null : new Date(ms).toISOString().slice(0, 10); }
function checksClean(tag) {
  var bad = SD.selfCheck().filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
  ok(tag + ': verifier clean', bad.length === 0, bad.join(' | '));
}

/* ---------- 1. averages divide by the values present ---------- */
var csv = 'region,score,dt\nA,10,2024-01-05\nA,,2024-01-06\nA,20,2024-01-07\nB,30,2024-02-01\nB,,2024-02-02\nB,,2024-02-03\nB,50,2024-02-04\n';
for (var i = 0; i < 12; i++) csv += 'C,' + (40 + i) + ',2024-03-' + (10 + i) + '\n';
SD.loadText(csv, 'avg.csv');
var a = SD.aggregate(0, 1, 'avg');
var byLab = {}; a.labels.forEach(function (l, j) { byLab[l] = a.values[j]; });
near('aggregate avg A ignores the blank', byLab.A, 15);
near('aggregate avg B ignores two blanks', byLab.B, 40);
near('aggregate avg C', byLab.C, 45.5);
var P = SD.buildPivot(0, 2, 1, 'avg', 'month');
var pr = {}; P.rowLabels.forEach(function (l, j) { pr[l] = P.rowTot[j]; });
near('pivot row average A', pr.A, 15);
near('pivot row average B', pr.B, 40);
near('pivot grand average is total over values', P.grand, (10 + 20 + 30 + 50 + 546) / 16);
var ser = SD.fcBuildSeries(2, 1, 'avg', 'month', 'keep');
near('forecast series avg Jan', ser.values[0], 15);
near('forecast series avg Feb', ser.values[1], 40);
var cr = SD.contribRate([0, 1, 2], [3, 4, 5, 6], 0, 1, 'month');
near('driver baseline average', cr.meanA, 15);
near('driver comparison average', cr.meanB, 40);
near('driver identity still closes', cr.mix + cr.rate + cr.interaction, cr.rateDelta);
near('driver average agrees with standardization side', SD.ssqSide([0, 1, 2], 0, 1).mean, cr.meanA);
checksClean('avg file');
ok('verifier carries the group average check', SD.selfCheck().some(function (c) { return /Group averages divide by the values present/.test(c.name); }));

var csv2 = 'g,v\n';
for (var g = 0; g < 20; g++) for (var k = 0; k < 3; k++) csv2 += 'g' + g + ',' + (g + 1) + '\n';
SD.loadText(csv2, 'other.csv');
var a2 = SD.aggregate(0, 1, 'avg', null, 14);
eq('avg folds the tail into Other', a2.labels[a2.labels.length - 1], 'Other (6)');
near('Other of an average is the average of the folded rows', a2.values[a2.values.length - 1], 3.5);
var a3 = SD.aggregate(0, 1, 'sum', null, 14);
near('Other of a total is still the total', a3.values[a3.values.length - 1], 3 * (1 + 2 + 3 + 4 + 5 + 6));

/* ---------- 2. dates ---------- */
eq('30 Feb refused', SD.parseDate('2024-02-30'), null);
eq('month 13 refused', SD.parseDate('2024-13-45'), null);
eq('31 Feb by name refused', SD.parseDate('31 Feb 2024'), null);
eq('zero day and month refused', SD.parseDate('00/00/2024'), null);
eq('trailing junk refused', SD.parseDate('2024-01-15junk'), null);
eq('leap day accepted', day(SD.parseDate('2024-02-29')), '2024-02-29');
eq('non leap day refused', SD.parseDate('2023-02-29'), null);
eq('two digit year', day(SD.parseDate('1/5/24')), '2024-01-05');
eq('two digit year pivots to 1900s', day(SD.parseDate('1/5/85')), '1985-01-05');
eq('ISO with time and zone', day(SD.parseDate('2024-03-09T14:05:00.000Z')), '2024-03-09');
eq('US with PM time', new Date(SD.parseDate('3/9/2024 2:30 PM')).toISOString(), '2024-03-09T14:30:00.000Z');
eq('12 AM is midnight', new Date(SD.parseDate('3/9/2024 12:15 AM')).toISOString(), '2024-03-09T00:15:00.000Z');
eq('dotted European date', day(SD.parseDate('31.12.2024')), '2024-12-31');
eq('year and month', day(SD.parseDate('2024-07')), '2024-07-01');
eq('academic year is not a month', SD.parseDate('2024-25'), null);
eq('month name and year', day(SD.parseDate('Mar 2024')), '2024-03-01');
eq('explicit day first', day(SD.parseDate('03/04/2024', 'dmy')), '2024-04-03');
eq('explicit month first', day(SD.parseDate('03/04/2024', 'mdy')), '2024-03-04');

SD.loadText('d,v\n13/01/2024,1\n05/01/2024,2\n25/01/2024,3\n07/02/2024,4\n28/02/2024,5\n03/03/2024,6\n15/03/2024,7\n', 'dayfirst.csv');
eq('day-first column typed as date', SD.S.cols[0].type, 'date');
eq('day-first column settles its own order', SD.S.cols[0].dord, 'dmy');
eq('ambiguous value follows the column', day(SD.S.cols[0].vals[1]), '2024-01-05');
eq('every value lands in Jan to Mar', SD.S.cols[0].vals.every(function (v) { return new Date(v).getUTCMonth() <= 2; }), true);
SD.loadText('d,v\n01/02/2024,1\n03/04/2024,2\n05/06/2024,3\n07/08/2024,4\n09/10/2024,5\n11/12/2024,6\n', 'ambig.csv');
ok('all-ambiguous dates are flagged', SD.S.profile.quality.flags.some(function (f) { return f.key === 'dateorder'; }));
eq('all-ambiguous dates read month first', day(SD.S.cols[0].vals[1]), '2024-03-04');
SD.loadText('d,v\n13/01/2024,1\n01/13/2024,2\n05/06/2024,3\n07/08/2024,4\n25/02/2024,5\n02/25/2024,6\n', 'conflict.csv');
ok('conflicting order is flagged as bad', SD.S.profile.quality.flags.some(function (f) { return f.key === 'dateconflict' && f.lvl === 'bad'; }));
checksClean('conflict file');

/* ---------- 3. numbers ---------- */
eq('3,14 is not 314', SD.parseNum('3,14'), null);
eq('1,2,3 is not 123', SD.parseNum('1,2,3'), null);
eq('12,34 is not 1234', SD.parseNum('12,34'), null);
eq('1,234 is a grouped thousand', SD.parseNum('1,234').v, 1234);
eq('1,234,567.5', SD.parseNum('1,234,567.5').v, 1234567.5);
eq('currency with grouping', SD.parseNum('$1,250.00').v, 1250);
eq('accounting negative', SD.parseNum('(1,250)').v, -1250);
eq('comma mode', SD.parseNum('1.234,5', 'comma').v, 1234.5);
eq('comma mode refuses a second comma', SD.parseNum('1,2,3', 'comma'), null);
SD.loadText('item;price;qty\na;3,14;1\nb;12,5;2\nc;1.234,56;3\nd;0,99;4\ne;7,00;5\nf;15,25;6\n', 'euro.csv');
eq('comma-decimal column is numeric', SD.S.cols[1].type, 'number');
eq('comma-decimal column is marked', SD.S.cols[1].dec, 'comma');
near('3,14 reads as 3.14', SD.S.cols[1].vals[0], 3.14);
near('1.234,56 reads as 1234.56', SD.S.cols[1].vals[2], 1234.56);
ok('comma decimals are disclosed', SD.S.profile.quality.flags.some(function (f) { return f.key === 'commadec'; }));
SD.loadText('item,amount\na,"1,234"\nb,"2,500"\nc,"12,750"\nd,"900"\ne,"3,100"\nf,"4,075"\n', 'us.csv');
eq('grouped thousands stay point-decimal', SD.S.cols[1].dec, null);
near('grouped thousands value', SD.S.cols[1].vals[2], 12750);

/* ---------- 4. values that collide with built-in names ---------- */
SD.loadText('name,v\nconstructor,1\nconstructor,2\ntoString,3\ntoString,4\nalpha,5\nalpha,6\nalpha,7\nbeta,8\nbeta,9\nbeta,10\nvalueOf,3\nvalueOf,5\n__proto__,1\n__proto__,2\nhasOwnProperty,4\nhasOwnProperty,6\n', 'proto.csv');
var pc = SD.S.profile.cols[0];
eq('built-in names count as ordinary values', pc.uniq, 7);
ok('every count is a real number', pc.all.every(function (o) { return typeof o.c === 'number' && o.c === o.c && o.c > 0; }));
var a4 = SD.aggregate(0, 1, 'sum'), tot4 = 0;
a4.values.forEach(function (v) { tot4 += v; });
eq('no group lost from the total', tot4, 76);
eq('constructor group present', a4.labels.indexOf('constructor') >= 0, true);
eq('__proto__ group present', a4.labels.indexOf('__proto__') >= 0, true);
SD.S.filters[0] = { kind: 'cat', set: { alpha: 1 } };
SD.applyFilters(true);
eq('a filter on alpha does not leak constructor rows', SD.S.view.length, 3);
SD.S.filters = {}; SD.applyFilters(true);
checksClean('proto file');

/* ---------- 5. CSV and markup ---------- */
var rowsQ = SD.parseCSV('a,b\n5" pipe,2\n"x,1","he said ""hi"""\nlast,3\n', ',');
eq('a stray quote inside a field does not swallow the row', rowsQ.length, 4);
eq('stray quote kept as text', rowsQ[1][0], '5" pipe');
eq('quoted delimiter still works', rowsQ[2][0], 'x,1');
eq('escaped quote still works', rowsQ[2][1], 'he said "hi"');
var md = SD.mdToHtml('## Head **bold**\nhello <img src=x onerror=alert(1)> **b**\n- item <script>x</script>');
ok('briefing markup cannot inject an element', md.indexOf('<img') < 0 && md.indexOf('<script') < 0, md);
ok('bold survives escaping', md.indexOf('<strong>b</strong>') >= 0 && md.indexOf('<h3>Head <strong>bold</strong></h3>') >= 0, md);

/* ---------- 6. significance helpers against SciPy ---------- */
near('F upper tail (4.0; 2, 30)', SD.pValueF(4.0, 2, 30), 0.028844623295696835, 1e-7);
near('F upper tail (1.5; 5, 100)', SD.pValueF(1.5, 5, 100), 0.19660616797192573, 1e-7);
near('F upper tail (25; 3, 12)', SD.pValueF(25.0, 3, 12), 1.8962069870910665e-05, 1e-6);
near('t two sided (2.0; 10)', SD.pValueT(2.0, 10), 0.07338803477074037, 1e-7);
near('t two sided (0.5; 3)', SD.pValueT(0.5, 3), 0.651447964848151, 1e-7);
near('t two sided (4.5; 200)', SD.pValueT(4.5, 200), 1.151878126287533e-05, 1e-6);
near('p for r = 0.42, n = 50', SD.pValueR(0.42, 50), 0.0023933087943171475, 1e-7);
near('Spearman with an outlier', SD.spearman([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], [2, 1, 4, 3, 6, 5, 8, 7, 10, 9]), 0.9393939393939393, 1e-9);
eq('F of zero gives p of one', SD.pValueF(0, 2, 30), 1);
eq('perfect r gives p of zero', SD.pValueR(1, 20), 0);

/* ---------- 7. which aggregate a measure supports ---------- */
eq('revenue adds up', SD.additive({ name: 'revenue' }), true);
eq('unit_price does not', SD.additive({ name: 'unit_price' }), false);
eq('gpa does not', SD.additive({ name: 'gpa' }), false);
eq('discountPct does not', SD.additive({ name: 'discountPct' }), false);
eq('a percent column does not', SD.additive({ name: 'x', per: true }), false);
eq('mileage is not mistaken for age', SD.additive({ name: 'mileage' }), true);
eq('page_views is not mistaken for age', SD.additive({ name: 'page_views' }), true);

/* ---------- 8. unfinished end periods ---------- */
function daily(from, to, fn) {
  var out = 'when,amount,store\n', t = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z'), n = 0;
  for (; t <= end; t += 86400000) { out += new Date(t).toISOString().slice(0, 10) + ',' + fn(n) + ',' + (n % 2 ? 'north' : 'south') + '\n'; n++; }
  return out;
}
SD.loadText(daily('2024-01-01', '2025-03-12', function (n) { return 100 + (n % 7); }), 'partial.csv');
var sK = SD.fcBuildSeries(0, 1, 'sum', 'month', 'keep'), sT = SD.fcBuildSeries(0, 1, 'sum', 'month');
eq('keep holds 15 months', sK.values.length, 15);
eq('trim drops the unfinished March', sT.values.length, 14);
ok('trim records what it dropped', sT.trimmed.last && sT.trimmed.last.label === 'Mar 25');
ok('keep still reports the unfinished period', sK.kept.last && sK.kept.last.label === 'Mar 25');
eq('an average keeps every period', SD.fcBuildSeries(0, 1, 'avg', 'month').values.length, 15);
var Fp = SD.fcExplain({ dateIdx: 0, measIdx: 1, agg: 'sum', grain: 'month', season: 'auto', model: 'auto', horizon: 3 });
eq('forecast starts after the last complete month', day(Fp.times[0]), '2025-03-01');
ok('forecast for March is a full month, not twelve days', Fp.point[0] > 2500, 'got ' + Fp.point[0]);
SD.loadText(daily('2024-01-01', '2025-03-31', function (n) { return 100 + (n % 7); }), 'whole.csv');
eq('complete months are all kept', SD.fcBuildSeries(0, 1, 'sum', 'month').values.length, 15);
var first = 'when,amount\n';
for (var m = 1; m <= 12; m++) first += '2024-' + (m < 10 ? '0' + m : m) + '-01,' + (500 + m) + '\n';
first += '2025-01-01,520\n2025-02-01,530\n';
SD.loadText(first, 'monthly.csv');
eq('one row a month on the first is not read as unfinished', SD.fcBuildSeries(0, 1, 'sum', 'month').values.length, 14);

/* ---------- 9. Where to look first, on a file with planted findings ---------- */
function rng(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
var R = rng(7), rows = ['order_id,customer_id,order_date,plan,region,segment,revenue,visits,retained'];
var regs = ['north', 'south', 'east', 'west', 'central'], id = 1000;
for (var dn = 0; dn < 430; dn++) {
  var dt = new Date(Date.parse('2024-01-01T00:00:00Z') + dn * 86400000).toISOString().slice(0, 10);
  var perDay = dn >= 396 && dn < 425 ? 2 : 4;
  for (var q = 0; q < perDay; q++) {
    var plan = R() < 0.5 ? 'basic' : 'premium';
    var seg = plan === 'premium' ? (R() < 0.8 ? 'enterprise' : 'smb') : (R() < 0.2 ? 'enterprise' : 'smb');
    var region = R() < 0.62 ? 'north' : regs[1 + Math.floor(R() * 4)];
    var visits = 1 + Math.floor(R() * 20);
    var base = (seg === 'enterprise' ? 900 : 200) + (plan === 'premium' ? -60 : 0);
    var rev = Math.max(5, base + visits * 40 + (R() - 0.5) * 120);
    var retained = R() < (plan === 'premium' ? 0.82 : 0.48) ? 'yes' : 'no';
    rows.push((id++) + ',C' + Math.floor(R() * 260) + ',' + dt + ',' + plan + ',' + region + ',' + seg + ',' + rev.toFixed(2) + ',' + visits + ',' + retained);
  }
}
SD.loadText(rows.join('\n') + '\n', 'planted.csv');
var rec = SD.S.recs;
ok('recommendations exist', rec && rec.items.length >= 4, rec ? String(rec.items.length) : 'none');
eq('decision measure picked automatically', rec.focusName, 'revenue');
function kind(k) { return rec.items.filter(function (it) { return it.kind === k; })[0]; }
ok('ranked best first', rec.items.every(function (it, j) { return j === 0 || rec.items[j - 1].score >= it.score; }));
ok('ranks are 1..n', rec.items.every(function (it, j) { return it.rank === j + 1; }));
ok('scores stay inside 0 to 100', rec.items.every(function (it) { return it.score >= 0 && it.score <= 100; }));
ok('every item carries evidence, an action and its arithmetic', rec.items.every(function (it) { return it.why && it.go && typeof it.run === 'function' && it.how && it.how.length; }));
var seg = kind('segment');
ok('segment gap found on the planted field', seg && /segment/.test(seg.title), seg ? seg.title : 'missing');
var rv = kind('reversal');
ok('planted reversal found', !!rv, rec.items.map(function (it) { return it.kind; }).join(','));
ok('reversal ranks as act on this', rv && rv.level === 'high');
ok('reversal outranks the plain gap it qualifies', rv && seg && rv.rank < seg.rank);
var per = kind('period');
ok('planted fall in the latest complete month found', per && /fell/.test(per.title), per ? per.title : 'missing');
ok('unfinished month excluded from the period finding', per && /left out/.test(per.why), per ? per.why : '');
var cn = kind('concentration');
ok('planted concentration found on region', cn && /region/.test(cn.title) && /north/.test(cn.why), cn ? cn.why : 'missing');
var co = kind('corr');
ok('planted correlation found with visits', co && /visits/.test(co.title), co ? co.title : 'missing');
var ch = kind('cohort');
ok('repeat customers surface a cohort recommendation', !!ch);
ok('a clean file gets no quality item', !kind('quality'));
checksClean('planted file');

/* every action opens its analysis without throwing and leaves the verifier clean */
var revRan = false;
rec.items.forEach(function (it) {
  var threw = null;
  try { it.run(); } catch (e) { threw = e.message; }
  ok('action runs: ' + it.kind, threw === null, threw || '');
  if (it.kind === 'reversal') revRan = !!SD.S.drivers && SD.S.driverParams.agg === 'avg' && SD.S.driverParams.mode === 'segment' && !!SD.S.drivers.std;
  var veil = doc.getElementById('insveil'); if (veil) veil.classList.remove('on');
  var fv = doc.getElementById('fixveil'); if (fv) fv.classList.remove('on');
});
ok('segment action built the comparison', !!SD.S.compare);
ok('reversal action ran the drivers on averages with the mix held equal', revRan);
ok('period action ran the drivers on two complete periods', !!SD.S.drivers && SD.S.driverParams.mode === 'period' && !(SD.S.drivers.meta.partial && SD.S.drivers.meta.partial.length));
ok('cohort action built the cohorts', !!SD.S.cohort);
ok('concentration action added a chart', SD.S.custom.length === 1);
checksClean('after running every action');

/* the card */
var cards = doc.getElementById('reclist').querySelectorAll('.rec');
eq('one card per recommendation', cards.length, SD.S.recs.items.length);
ok('each card has two buttons of at least one action', doc.getElementById('reclist').querySelectorAll('.rec-a .btn').length === cards.length * 2);
var selF = doc.getElementById('rec-focus');
ok('decision measure selector lists the yes or no outcome', Array.prototype.some.call(selF.options, function (o) { return /retained \(rate\)/.test(o.textContent); }));

/* a yes or no outcome as the decision measure */
var ridx = -1;
SD.S.profile.cols.forEach(function (c) { if (c.name === 'retained') ridx = c.idx; });
SD.S.recFocus = ridx; SD.renderRecs();
var rr = SD.S.recs;
eq('rate focus is honoured', rr.focusName, 'retained');
eq('rate focus is averaged', rr.agg, 'avg');
var rs = rr.items.filter(function (it) { return it.kind === 'segment'; })[0];
ok('retention differs most by plan', rs && /plan/.test(rs.title) && /premium/.test(rs.why) && /%/.test(rs.why), rs ? rs.why : 'missing');
ok('no numeric-only analysis is offered for a rate', !rr.items.some(function (it) { return it.kind === 'forecast' || it.kind === 'corr' || it.kind === 'distribution' || it.kind === 'concentration'; }));
rr.items.forEach(function (it) { var t = null; try { it.run(); } catch (e) { t = e.message; } ok('rate action runs: ' + it.kind, t === null, t || ''); });
SD.S.recFocus = 'auto'; SD.renderRecs();

/* noise produces no confident finding */
var Rn = rng(99), nz = ['a,b,grp,when'];
for (var z = 0; z < 400; z++) nz.push((Rn() * 100).toFixed(2) + ',' + (Rn() * 100).toFixed(2) + ',g' + Math.floor(Rn() * 5) + ',' + new Date(Date.parse('2024-01-01T00:00:00Z') + z * 86400000).toISOString().slice(0, 10));
SD.loadText(nz.join('\n') + '\n', 'noise.csv');
var rz = SD.S.recs;
ok('noise yields no segment, reversal or correlation finding', !rz.items.some(function (it) { return it.kind === 'segment' || it.kind === 'reversal' || it.kind === 'corr'; }), rz.items.map(function (it) { return it.kind; }).join(','));
ok('noise explains itself in the not recommended list', rz.skipped.length >= 2);

/* quality first on a dirty file */
var dirty = ['amount,grp,when'];
for (var w = 0; w < 60; w++) dirty.push((w % 3 === 0 ? '' : String(100 + w)) + ',g' + (w % 3) + ',2024-01-' + (1 + (w % 28) < 10 ? '0' : '') + (1 + (w % 28)));
for (w = 0; w < 30; w++) dirty.push('150,g1,2024-02-10');
SD.loadText(dirty.join('\n') + '\n', 'dirty.csv');
var rq = SD.S.recs;
ok('quality leads on a dirty file', rq.items.length && rq.items[0].kind === 'quality', rq.items.map(function (it) { return it.kind + ':' + Math.round(it.score); }).join(','));

/* samples and report */
['sampleRetail', 'sampleCampus'].forEach(function (nm) {
  SD.loadText(SD[nm](), nm + '.csv');
  ok(nm + ': recommendations render', doc.getElementById('reclist').children.length > 0);
  checksClean(nm);
  var rep = SD.buildReport();
  ok(nm + ': report carries the ranking', /## Where to look first/.test(rep));
  var pay = SD.briefPayload();
  ok(nm + ': briefing payload carries the ranking', pay.recommendedAnalyses && pay.recommendedAnalyses.ranked.length === Math.min(6, SD.S.recs.items.length));
  ok(nm + ': briefing is told to use the ranking', /recommendedAnalyses/.test(SD.briefPrompt(pay, '', '')));
});
SD.loadText(SD.sampleCampus(), 'campus.csv');
ok('term data is not forecast as a run of zeros', SD.S.recs.skipped.some(function (x) { return /cycle/.test(x); }) && !SD.S.recs.items.some(function (it) { return it.kind === 'forecast'; }));
doc.getElementById('c-run').onclick();
var kp = Array.prototype.map.call(doc.getElementById('cohkpi').querySelectorAll('.stat .k'), function (n) { return n.textContent; });
ok('term cohorts do not report total churn after one month', kp.indexOf('Churn after first') < 0 && kp.some(function (x) { return /^Not back by M\d+$/.test(x); }), kp.join(' | '));

/* housekeeping */
var script = html.slice(html.indexOf('<script>\n(function(){'));
ok('source is ASCII clean', !/[^\x00-\x7F]/.test(html));
ok('no forbidden canvas or dialog calls', !/\.roundRect\(|\.ellipse\(|window\.confirm\(/.test(script));
eq('one portfolio link in the header', (html.match(/<a class="home" href="https:\/\/augustineiacopelli\.github\.io\/appaday\/">/g) || []).length, 1);
eq('one portfolio link in the footer', (html.match(/<footer>[\s\S]*?href="https:\/\/augustineiacopelli\.github\.io\/appaday\/"/g) || []).length, 1);

console.log('\naudit: passed ' + pass + ', failed ' + fail);
if (failures.length) { console.log('\nfailures:'); failures.forEach(function (x) { console.log('  - ' + x); }); }
process.exit(fail ? 1 : 0);
