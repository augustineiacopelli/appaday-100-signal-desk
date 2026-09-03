var fs=require('fs');
var { JSDOM }=require('jsdom');
var WIDTH=parseInt(process.argv[2],10)||700;

var bad=[], calls=0, pass=0, fail=0, failures=[];
function ok(n,c,x){ if(c){pass++;} else {fail++;failures.push(n+(x?' :: '+x:''));} }
function chk(fn,args){
  calls++;
  for(var i=0;i<args.length;i++){
    var v=args[i];
    if(typeof v==='number' && !isFinite(v)){ bad.push(fn+' arg'+i+'='+v); return; }
  }
}
var html=fs.readFileSync('index.html','utf8');
var dom=new JSDOM(html,{runScripts:'dangerously',url:'https://augustineiacopelli.github.io/appaday-100-signal-desk/'});
var win=dom.window, doc=win.document;
function makeCtx(){
  var c={ canvas:null, setTransform:function(){chk('setTransform',arguments);},
    clearRect:function(){chk('clearRect',arguments);}, beginPath:function(){},
    moveTo:function(){chk('moveTo',arguments);}, lineTo:function(){chk('lineTo',arguments);},
    arcTo:function(){chk('arcTo',arguments);}, closePath:function(){},
    rect:function(){chk('rect',arguments);}, arc:function(){chk('arc',arguments);},
    save:function(){}, restore:function(){},
    translate:function(){chk('translate',arguments);}, rotate:function(){chk('rotate',arguments);},
    setLineDash:function(){}, fill:function(){}, stroke:function(){},
    fillText:function(t,x,y){chk('fillText',[x,y]);},
    measureText:function(s){ return { width:String(s).length*6 }; },
    createLinearGradient:function(){ return { addColorStop:function(){} }; } };
  return c;
}
win.HTMLCanvasElement.prototype.getContext=function(){ return makeCtx(); };
Object.defineProperty(win.Element.prototype,'clientWidth',{get:function(){return WIDTH;},configurable:true});
Object.defineProperty(win.Element.prototype,'clientHeight',{get:function(){return 400;},configurable:true});
doc.dispatchEvent(new win.Event('DOMContentLoaded'));
var SD=win.SignalDesk, S;

SD.loadText(SD.sampleRetail(),'retail-orders.csv');
S=SD.S;

// exercise every forecast configuration
var grains=['month','week'], aggs=['sum','avg','count'], models=['auto','naive','snaive','ma','linear','ses','holt','hw'], seasons=['auto','0','4','12'];
var ran=0;
for(var g=0;g<grains.length;g++){
  for(var a=0;a<aggs.length;a++){
    for(var m=0;m<models.length;m++){
      for(var s=0;s<seasons.length;s++){
        doc.getElementById('f-grain').value=grains[g];
        doc.getElementById('f-agg').value=aggs[a];
        doc.getElementById('f-model').value=models[m];
        doc.getElementById('f-season').value=seasons[s];
        if(aggs[a]!=='count') doc.getElementById('f-meas').value=doc.getElementById('f-meas').options[1].value;
        doc.getElementById('f-h').value=['3','6','12','24'][(g+a+m+s)%4];
        doc.getElementById('f-run').onclick();
        ran++;
        if(S.forecast && !S.forecast.tooShort){
          var F=S.forecast, q;
          for(q=0;q<F.point.length;q++){
            ok('finite point '+grains[g]+'/'+aggs[a]+'/'+models[m]+'/'+seasons[s]+'#'+q,
               isFinite(F.point[q])&&isFinite(F.lo[q])&&isFinite(F.hi[q]),
               F.point[q]+' ['+F.lo[q]+','+F.hi[q]+']');
          }
          var ck=SD.selfCheck().filter(function(c){return !c.ok;});
          ok('verifier clean '+grains[g]+'/'+aggs[a]+'/'+models[m]+'/'+seasons[s], ck.length===0,
             ck.map(function(c){return c.name;}).join('|'));
        }
      }
    }
  }
}
console.log('width '+WIDTH+': ran '+ran+' configurations, '+calls+' instrumented draw calls');
ok('no non-finite canvas geometry', bad.length===0, bad.slice(0,5).join(' / '));
console.log('passed '+pass+', failed '+fail);
if(fail){ failures.slice(0,10).forEach(function(f){console.log('  FAIL '+f);}); process.exit(1); }
