var fs=require('fs'); var { JSDOM }=require('jsdom');
var pass=0,fail=0,failures=[];
function ok(n,c,x){ if(c){pass++;} else {fail++;failures.push(n+(x?' :: '+x:''));} }
var html=fs.readFileSync('index.html','utf8');
var dom=new JSDOM(html,{runScripts:'dangerously',url:'https://augustineiacopelli.github.io/appaday-100-signal-desk/'});
var win=dom.window,doc=win.document;
win.HTMLCanvasElement.prototype.getContext=function(){return{setTransform:function(){},clearRect:function(){},beginPath:function(){},moveTo:function(){},lineTo:function(){},arcTo:function(){},closePath:function(){},rect:function(){},arc:function(){},save:function(){},restore:function(){},translate:function(){},rotate:function(){},setLineDash:function(){},fill:function(){},stroke:function(){},fillText:function(){},measureText:function(s){return{width:String(s).length*6};},createLinearGradient:function(){return{addColorStop:function(){}};}};};
Object.defineProperty(win.Element.prototype,'clientWidth',{get:function(){return 700;},configurable:true});
Object.defineProperty(win.Element.prototype,'clientHeight',{get:function(){return 400;},configurable:true});
doc.dispatchEvent(new win.Event('DOMContentLoaded'));
var SD=win.SignalDesk;

/* campus sample */
SD.loadText(SD.sampleCampus(),'campus-enrollment.csv');
var S=SD.S;
ok('campus loads',S.rows.length>100);
doc.getElementById('f-agg').value='sum';
doc.getElementById('f-grain').value='month';
if(doc.getElementById('f-meas').options.length>1) doc.getElementById('f-meas').value=doc.getElementById('f-meas').options[1].value;
doc.getElementById('f-run').onclick();
ok('campus forecast returns something',!!S.forecast);
if(S.forecast && !S.forecast.tooShort){
  ok('campus verifier clean',SD.selfCheck().filter(function(c){return !c.ok;}).length===0);
}

/* a flat constant series: naive should not be beaten meaningfully, all finite */
var flat=['d,v'];
for(var i=0;i<24;i++){ var mo=(i%12)+1; var yr=2024+Math.floor(i/12);
  flat.push(yr+'-'+(mo<10?'0'+mo:mo)+'-15,100'); }
SD.loadText(flat.join('\n'),'flat.csv');
doc.getElementById('f-agg').value='sum';
doc.getElementById('f-grain').value='month';
doc.getElementById('f-meas').value=doc.getElementById('f-meas').options[1].value;
doc.getElementById('f-run').onclick();
ok('flat series forecasts',!!S.forecast && !S.forecast.tooShort);
ok('flat forecast is flat',Math.abs(S.forecast.point[0]-100)<1e-6,String(S.forecast.point[0]));
ok('flat series has near-zero interval',(S.forecast.hi[0]-S.forecast.lo[0])<1e-6);
ok('flat verifier clean',SD.selfCheck().filter(function(c){return !c.ok;}).length===0);

/* a series with a genuine gap in the middle */
var gap=['d,v'];
for(i=0;i<8;i++){ var m2=i+1; gap.push('2024-'+(m2<10?'0'+m2:m2)+'-15,'+(50+i*3)); }
for(i=0;i<8;i++){ var m3=i+1; gap.push('2025-'+(m3<10?'0'+m3:m3)+'-15,'+(90+i*3)); }
SD.loadText(gap.join('\n'),'gap.csv');
doc.getElementById('f-agg').value='sum';
doc.getElementById('f-grain').value='month';
doc.getElementById('f-meas').value=doc.getElementById('f-meas').options[1].value;
doc.getElementById('f-run').onclick();
ok('gapped series forecasts',!!S.forecast && !S.forecast.tooShort);
ok('gaps are detected and reported',S.forecast.series.gaps===4,String(S.forecast.series.gaps));
ok('gap banner shown',/period.{0,3} had no rows/.test(doc.getElementById('fcout').textContent));
ok('gapped grid is unbroken',(function(){
  var t=S.forecast.series.times;
  for(var q=1;q<t.length;q++) if(SD.fcNextBucket(t[q-1],'month')!==t[q]) return false;
  return true;})());
ok('gapped verifier clean',SD.selfCheck().filter(function(c){return !c.ok;}).length===0);

/* too few dated rows: refused at the date-eligibility gate, not a crash */
SD.loadText('d,v\n2024-01-15,10\n2024-01-20,12','tiny.csv');
doc.getElementById('f-agg').value='sum';
doc.getElementById('f-grain').value='month';
var threw=false;
try{ doc.getElementById('f-run').onclick(); }catch(e){ threw=true; }
ok('a two-row file does not throw',!threw);
ok('a two-row file offers no date field',doc.getElementById('f-dim').options.length===0);
ok('the refusal is explained',doc.getElementById('toast').textContent==='This dataset has no date column with enough periods.');
ok('no forecast state is left behind',S.forecast===null);
ok('verifier clean with no forecast',SD.selfCheck().filter(function(c){return !c.ok;}).length===0);

/* enough rows but too few periods: refused at the length gate */
var few=['d,v'];
for(i=0;i<6;i++){ few.push('2024-0'+((i%3)+1)+'-1'+i+',10'); }
SD.loadText(few.join('\n'),'three.csv');
doc.getElementById('f-agg').value='sum';
doc.getElementById('f-grain').value='month';
doc.getElementById('f-meas').value=doc.getElementById('f-meas').options[1].value;
threw=false;
try{ doc.getElementById('f-run').onclick(); }catch(e){ threw=true; }
ok('a three-period series does not throw',!threw);
ok('a three-period series is flagged too short',S.forecast && S.forecast.tooShort===true);
ok('the too-short banner names the shortfall',/3 periods at month grain and needs at least 5/.test(doc.getElementById('fcout').textContent));
ok('verifier clean with a too-short forecast',SD.selfCheck().filter(function(c){return !c.ok;}).length===0);

/* negative values must survive */
var neg=['d,v'];
for(i=0;i<18;i++){ var m4=(i%12)+1; var y4=2024+Math.floor(i/12);
  neg.push(y4+'-'+(m4<10?'0'+m4:m4)+'-15,'+(-40+i*5)); }
SD.loadText(neg.join('\n'),'neg.csv');
doc.getElementById('f-agg').value='sum';
doc.getElementById('f-grain').value='month';
doc.getElementById('f-meas').value=doc.getElementById('f-meas').options[1].value;
doc.getElementById('f-run').onclick();
ok('negative series forecasts',!!S.forecast && !S.forecast.tooShort);
ok('negative forecast finite',isFinite(S.forecast.point[0])&&isFinite(S.forecast.lo[0]));
ok('negative verifier clean',SD.selfCheck().filter(function(c){return !c.ok;}).length===0);

console.log('edge cases: passed '+pass+', failed '+fail);
if(fail){ failures.forEach(function(f){console.log('  FAIL '+f);}); process.exit(1); }
