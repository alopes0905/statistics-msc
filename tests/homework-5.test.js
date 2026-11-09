import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FUNCTIONS,getFunction,sincPreimage,gcd,thomaeRational,pathologicalSamples} from '../docs/homework-5/exercise-1/js/functions.js';
import {riemann} from '../docs/homework-5/exercise-1/js/riemann.js';
import {layerCake} from '../docs/homework-5/exercise-1/js/lebesgue.js';
import {integrationExperiment,validateConfig} from '../docs/homework-5/exercise-1/js/experiments.js';
import {compositeSimpson,gaussLegendre,gaussLegendreRule,erfSeries,erfSeriesTerms} from '../docs/homework-5/exercise-2/js/numerical-methods.js';
import {normalDensity,normalCDF,normalTail,cdfSimpson,cdfSeries,cdfSeriesTerms} from '../docs/homework-5/exercise-2/js/normal-cdf.js';
import {cdfExperiment,TEST_POINTS} from '../docs/homework-5/exercise-2/js/experiments.js';
import {NORMAL_REFERENCES,NIST_AREAS} from '../docs/homework-5/data/normal-reference.js';
import {sum,benchmark} from '../docs/homework-5/shared/numerics.js';
import {format} from '../docs/homework-5/shared/ui.js';
import {extractCodeRegion} from '../docs/assets/js/code-viewer.js';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const close=(a,b,tolerance=1e-13)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b} by ${Math.abs(a-b)}`);
const relative=(a,b,tolerance=5e-14)=>assert.ok(b!==0&&Math.abs((a-b)/b)<=tolerance,`Relative error ${Math.abs((a-b)/b)} for ${a} vs ${b}`);

test('HW5: all seven functions document domains, formulas, references, measures and limitations',()=>{
  assert.equal(FUNCTIONS.length,7);
  for(const fn of FUNCTIONS){assert.equal(getFunction(fn.id),fn);assert.ok(fn.name&&fn.formula&&fn.classification&&fn.limitations&&fn.measureFormula);assert.ok(Number.isFinite(fn.reference));assert.ok(Object.isFrozen(fn));}
  assert.throws(()=>getFunction('unknown'));
});

test('HW5: finite evaluators obey every domain and continuous endpoint convention',()=>{
  for(const fn of FUNCTIONS){const [a,b]=fn.domain;assert.throws(()=>fn.evaluate(a-1));assert.throws(()=>fn.evaluate(b+1));for(const x of [NaN,Infinity,'0'])assert.throws(()=>fn.evaluate(x));}
  assert.equal(getFunction('sine').evaluate(Math.PI),0);assert.equal(getFunction('sinc').evaluate(0),1);assert.equal(getFunction('sinc').evaluate(Math.PI),0);
  assert.throws(()=>getFunction('singular').evaluate(0));
});

test('HW5: midpoint nodes and widths are independently observable, not endpoint samples',()=>{
  const nodes=[];const fn={domain:[2,6],evaluate:x=>{nodes.push(x);return x*x;}};
  const r=riemann(fn,4);
  assert.deepEqual(nodes,[2.5,3.5,4.5,5.5]);assert.equal(r.value,2.5**2+3.5**2+4.5**2+5.5**2);assert.equal(r.fEvaluations,4);
});

test('HW5: left and right rules have their own correct representative points',()=>{
  const fn={domain:[-1,1],evaluate:x=>x*x};
  assert.equal(riemann(fn,2,'left').value,1);assert.equal(riemann(fn,2,'right').value,1);assert.equal(riemann(fn,2).value,0.5);
});

test('HW5: quadratic midpoint error has the exact 1/(12K²) law',()=>{
  for(const K of [1,2,3,8,17,64,1024])close(1/3-riemann(getFunction('quadratic'),K).value,1/(12*K*K),2e-16);
});

test('HW5: the sine midpoint sum matches an independent finite trigonometric identity',()=>{
  for(const K of [1,3,8,64,1024])close(riemann(getFunction('sine'),K).value,Math.PI/(K*Math.sin(Math.PI/(2*K))),1e-15);
});

test('HW5: jump locations, odd/even partitions and strict endpoint tags behave correctly',()=>{
  const step=getFunction('step'),indicator=getFunction('indicator');
  assert.equal(step.evaluate(0.5),3);assert.equal(indicator.evaluate(0.5),0);
  assert.equal(riemann(step,2).value,2);close(riemann(step,3).value,7/3);
  assert.equal(riemann(indicator,2).value,0.5);close(riemann(indicator,3).value,1/3);
  assert.equal(riemann(step,2,'left').value,2);assert.equal(riemann(step,2,'right').value,3);
});

test('HW5: known elementary integrals are approached without hardcoded output',()=>{
  const references={quadratic:1/3,sine:2,step:2,absolute:1/4,indicator:1/2,singular:2};
  for(const [id,target]of Object.entries(references))assert.equal(getFunction(id).reference,target);
  for(const id of ['quadratic','sine','sinc']){
    const fn=getFunction(id),coarse=Math.abs(riemann(fn,8).value-fn.reference),fine=Math.abs(riemann(fn,1024).value-fn.reference);
    assert.ok(fine<coarse/1000);
  }
});

test('HW5: analytic superlevel lengths agree with independently solved cases',()=>{
  close(getFunction('quadratic').measure(0.25).value,0.5);
  close(getFunction('sine').measure(0.5).value,2*Math.PI/3);
  assert.equal(getFunction('absolute').measure(0.125).value,0.75);
  assert.equal(getFunction('indicator').measure(0).value,0.5);
  assert.equal(getFunction('indicator').measure(1).value,0);
  assert.equal(getFunction('step').measure(0).value,1);assert.equal(getFunction('step').measure(1).value,0.5);assert.equal(getFunction('step').measure(3).value,0);
});

test('HW5: measures are nonnegative, nonincreasing and bounded by the domain length',()=>{
  for(const fn of FUNCTIONS){
    let previous=fn.domain[1]-fn.domain[0];
    for(let i=-1;i<=100;i+=1){const t=i*(fn.height??8)/100,m=fn.measure(t);assert.ok(m.value>=0&&m.value<=previous+2e-12);previous=m.value;close(m.intervals.reduce((s,[a,b])=>s+b-a,0),m.value,1e-14);}
    assert.throws(()=>fn.measure(NaN));assert.throws(()=>fn.measure(Infinity));
  }
});

test('HW5: dense domain counts independently validate preimage lengths, only in tests',()=>{
  const count=20000;
  for(const fn of FUNCTIONS){
    const [a,b]=fn.domain;
    for(const t of [0.2,0.6,1.2,2.5]){
      let inside=0;for(let i=0;i<count;i+=1)if(fn.evaluate(a+(i+0.5)*(b-a)/count)>t)inside+=1;
      close(fn.measure(t).value,(b-a)*inside/count,2*(b-a)/count);
    }
  }
});

test('HW5: layer-cake thresholds and shared-endpoint evaluation counts are exact',()=>{
  const levels=[],fn={height:2,reference:2,measure:t=>{levels.push(t);return{value:2-t,lower:2-t,upper:2-t,fEvaluations:0,rootIterations:0};}};
  const r=layerCake(fn,2);
  assert.deepEqual(levels,[0,1,2,0.5,1.5]);assert.equal(r.measureEvaluations,5);assert.equal(r.fEvaluations,0);assert.equal(r.midpoint,2);assert.equal(r.lower,1);assert.equal(r.upper,3);
});

test('HW5: lower/midpoint/upper one-bin results have hand-derived values',()=>{
  const quadratic=layerCake(getFunction('quadratic'),1);assert.equal(quadratic.lower,0);assert.equal(quadratic.upper,1);close(quadratic.midpoint,1-Math.SQRT1_2);
  const step=layerCake(getFunction('step'),1);assert.equal(step.lower,0);assert.equal(step.midpoint,1.5);assert.equal(step.upper,3);
  const indicator=layerCake(getFunction('indicator'),1);assert.equal(indicator.lower,0);assert.equal(indicator.midpoint,0.5);assert.equal(indicator.upper,0.5);
});

test('HW5: enclosures contain every bounded reference, including discontinuous functions',()=>{
  for(const fn of FUNCTIONS.filter(fn=>!fn.improper))for(const K of [1,2,3,8,31,128,1024]){
    const r=layerCake(fn,K);assert.ok(r.lower<=fn.reference+2e-13,`${fn.id},${K}`);assert.ok(r.upper>=fn.reference-2e-13,`${fn.id},${K}`);assert.ok(r.midpoint>=r.lower-2e-12&&r.midpoint<=r.upper+2e-12);
  }
});

test('HW5: the layer-cake enclosure width telescopes to Δt[M(0)−M(H)]',()=>{
  for(const id of ['quadratic','sine','step','absolute','indicator']){
    const fn=getFunction(id),r=layerCake(fn,128);close(r.enclosureWidth,fn.height/128*(fn.measure(0).value-fn.measure(fn.height).value),2e-16);
  }
});

test('HW5: sinc inversion solves independent known levels and records its bracket/cost',()=>{
  for(const [t,expected]of [[2/Math.PI,Math.PI/2],[3*Math.sqrt(3)/(2*Math.PI),Math.PI/3]]){
    const result=sincPreimage(t);close(result.value,expected,6e-13);assert.ok(result.upper-result.lower<=1e-12);assert.ok(result.lower<=expected+1e-14&&result.upper>=expected-1e-14);assert.equal(result.fEvaluations,result.rootIterations);assert.equal(result.rootIterations,42);
  }
  assert.equal(sincPreimage(0).value,Math.PI);assert.equal(sincPreimage(1).value,0);assert.throws(()=>sincPreimage(0.5,1e-12,1));
  for(const tolerance of [0,1e-16,1,NaN])assert.throws(()=>sincPreimage(0.5,tolerance));
});

test('HW5: sinc inversion work is fully counted, not reported as constant-cost measure calls',()=>{
  const result=layerCake(getFunction('sinc'),8);
  assert.equal(result.measureEvaluations,17);assert.equal(result.fEvaluations,15*42);assert.equal(result.rootIterations,result.fEvaluations);assert.ok(result.rootUncertainty>0&&result.rootUncertainty<1e-12);
});

test('HW5: singular level measures, cutoff integral and exact omitted tail are separate',()=>{
  const fn=getFunction('singular');assert.equal(fn.measure(0).value,1);assert.equal(fn.measure(1).value,1);assert.equal(fn.measure(2).value,0.25);assert.equal(fn.measure(4).value,1/16);
  for(const T of [1,2,8,64]){const r=layerCake(fn,1024,T);assert.equal(r.target,2-1/T);assert.equal(r.omittedTail,1/T);assert.ok(r.lower<=r.target&&r.target<=r.upper);assert.equal(r.target+r.omittedTail,2);}
});

test('HW5: improper midpoint sums never evaluate zero and converge to two',()=>{
  const fn=getFunction('singular'),coarse=riemann(fn,64),fine=riemann(fn,1024);
  assert.ok(fine.value<2&&fine.value>coarse.value);assert.ok(2-fine.value<0.02);
  assert.throws(()=>riemann(fn,8,'left'));
});

test('HW5: irrational families are symbolic; rational Thomae values use genuine GCD reduction',()=>{
  assert.equal(gcd(54,24),6);assert.equal(gcd(0,7),7);assert.equal(thomaeRational(2,4),0.5);assert.equal(thomaeRational(6,9),1/3);assert.equal(thomaeRational(0,8),1);
  for(const K of [8,16,64,1024]){const r=pathologicalSamples(K);assert.equal(r.dirichlet.rationalSum,1);assert.equal(r.dirichlet.irrationalSum,0);assert.equal(r.dirichlet.lowerDarboux,0);assert.equal(r.dirichlet.upperDarboux,1);assert.equal(r.dirichlet.lebesgueIntegral,0);assert.equal(r.thomae.rationalSum,1/(2*K));assert.equal(r.thomae.riemannIntegral,0);assert.match(r.irrationalFamily,/√2/);}
  close(pathologicalSamples(3).thomae.rationalSum,(1/6+1/2+1/6)/3);
  for(const args of [[-1,2],[1,0],[2,1],[.5,2]])assert.throws(()=>thomaeRational(...args));
});

test('HW5: integration parameters reject invalid bounds and nonfinite results',()=>{
  for(const K of [0,-1,1.5,4097,NaN,'8']){assert.throws(()=>riemann(getFunction('quadratic'),K));assert.throws(()=>layerCake(getFunction('quadratic'),K));assert.throws(()=>pathologicalSamples(K));}
  for(const domain of [[1,1],[2,1],[NaN,1]])assert.throws(()=>riemann({domain,evaluate:x=>x},8));
  assert.throws(()=>riemann({domain:[0,1],evaluate:()=>Infinity},8));assert.throws(()=>riemann(getFunction('quadratic'),8,'bad'));
  assert.throws(()=>layerCake({height:1,measure:()=>({value:NaN,lower:0,upper:1})},8));
  const valid={id:'quadratic',K:64,rule:'midpoint',cutoff:8};assert.deepEqual(validateConfig(valid),valid);
  for(const change of [{id:'x'},{rule:'x'},{cutoff:0},{cutoff:65},{cutoff:NaN}])assert.throws(()=>validateConfig({...valid,...change}));
});

test('HW5: deterministic integration studies reuse the implemented algorithms at each K',()=>{
  const config={id:'step',K:3,rule:'midpoint',cutoff:8};const a=integrationExperiment(config,false),b=integrationExperiment(config,false);assert.deepEqual(a,b);
  for(const row of a.rows){assert.deepEqual(row.domain,riemann(getFunction('step'),row.K));assert.deepEqual(row.range,layerCake(getFunction('step'),row.K));}
  assert.equal(a.selected.K,3);assert.equal(a.selected.range.midpoint,2);
});

test('HW5: warmed benchmark reports the median and actual bounded batch repetitions',()=>{
  const times=[0,2,10,17,20,21,30,35,40,43,50,59];let calls=0;
  const result=benchmark(()=>{calls+=1;},()=>times.shift());assert.deepEqual(result,{medianMs:5,repetitions:1,batches:5});assert.equal(calls,8);
  const zero=benchmark(()=>{},()=>0);assert.equal(zero.repetitions,256);assert.equal(zero.medianMs,0);
});

test('HW5: standard normal density has the correct exponent and normalization',()=>{
  relative(normalDensity(0),0.39894228040143267794);relative(normalDensity(1),0.2419707245191433498);relative(normalDensity(2),0.05399096651318805195);
  assert.equal(normalDensity(-2),normalDensity(2));assert.throws(()=>normalDensity(Infinity));
});

test('HW5: Simpson weights, signed width and cubic exactness match hand integration',()=>{
  const points=[];const r=compositeSimpson(x=>{points.push(x);return x**3;},0,2,2);
  assert.deepEqual(points,[0,1,2]);assert.equal(r.value,4);assert.equal(r.evaluations,3);
  close(compositeSimpson(x=>3*x*x+2*x+1,-1,2,8).value,15);assert.equal(compositeSimpson(x=>x**3,2,0,2).value,-4);
  assert.deepEqual(compositeSimpson(()=>{throw Error('Must not evaluate');},1,1,2),{value:0,evaluations:0});
});

test('HW5: generated Gauss nodes and weights reproduce independent 2- and 3-node rules',()=>{
  const two=gaussLegendreRule(2);close(two.nodes[0],-1/Math.sqrt(3),2e-16);close(two.weights[0],1,1e-15);
  const three=gaussLegendreRule(3);close(three.nodes[0],-Math.sqrt(3/5));close(three.nodes[1],0);close(three.weights[0],5/9);close(three.weights[1],8/9);
  assert.equal(gaussLegendreRule(32),gaussLegendreRule(32));assert.ok(Object.isFrozen(two.nodes));assert.ok(gaussLegendreRule(32).setupEvaluations>16);
});

test('HW5: 32-point Gauss–Legendre integrates all monomials through degree 63',()=>{
  for(let power=0;power<=63;power+=1){const r=gaussLegendre(x=>x**power,-1,1,32);close(r.value,power%2?0:2/(power+1),2e-14);assert.equal(r.evaluations,32);}
});

test('HW5: Gaussian quadrature maps arbitrary finite intervals and counts every callback',()=>{
  let calls=0;const r=gaussLegendre(x=>{calls+=1;return x*x;},2,5,16);close(r.value,39,3e-14);assert.equal(calls,16);
});

test('HW5: erf coefficient recurrence matches independently expanded first terms',()=>{
  const z=0.5,factor=2/Math.sqrt(Math.PI);
  close(erfSeriesTerms(z,1).value,factor*z);close(erfSeriesTerms(z,2).value,factor*(z-z**3/3));close(erfSeriesTerms(z,3).value,factor*(z-z**3/3+z**5/10));
});

test('HW5: adaptive erf series has explicit stopping, symmetry and failure behavior',()=>{
  assert.deepEqual(erfSeries(0),{value:0,terms:0,truncationBound:0});
  relative(erfSeries(1).value,0.84270079294971486934);assert.equal(erfSeries(-1).value,-erfSeries(1).value);
  const result=erfSeries(Math.SQRT2);assert.ok(result.terms<=30&&result.truncationBound<=2e-17);assert.throws(()=>erfSeries(1,{maxTerms:1}),/converge/);
  assert.throws(()=>erfSeries(2));assert.throws(()=>cdfSeries(3));
});

test('HW5: main CDF and directly retained tails match all independent high-precision references',()=>{
  for(const row of NORMAL_REFERENCES){const result=normalCDF(row.x);close(result.value,Number(row.cdf),3e-16);relative(result.smallerTail,Math.min(Number(row.cdf),Number(row.survival)));assert.ok(result.value>=0&&result.value<=1);}
});

test('HW5: Φ(−8) and Φ(−10) satisfy relative tolerances that reject an incorrect zero',()=>{
  for(const x of [-8,-10]){const expected=Number(NORMAL_REFERENCES.find(row=>row.x===x).cdf),actual=normalCDF(x).value;assert.ok(actual>0);relative(actual,expected);assert.ok(Math.abs((0-expected)/expected)>5e-14);}
});

test('HW5: positive CDF saturation retains an accurate nonzero complementary tail',()=>{
  const result=normalCDF(10),reference=NORMAL_REFERENCES.find(row=>row.x===10);
  assert.equal(result.value,1);assert.ok(result.survival>0);relative(result.survival,Number(reference.survival));assert.equal(1-result.value,0);
});

test('HW5: central exact value, symmetry and nondecreasing floating-point CDF hold',()=>{
  assert.equal(normalCDF(0).value,0.5);let previous=0;
  for(let i=-200;i<=200;i+=1){const x=i/20,r=normalCDF(x);assert.ok(r.value>=previous);previous=r.value;assert.equal(r.survival,normalCDF(-x).value);close(r.cdf+r.survival,1,1e-16);}
});

test('HW5: the CDF derivative agrees with the density independently of its quadrature',()=>{
  for(const x of [-3,-1,0,1,3]){const h=1e-4,difference=(normalCDF(x+h).value-normalCDF(x-h).value)/(2*h);close(difference,normalDensity(x),8e-10);}
});

test('HW5: branch transitions at ±2 remain accurate against independent fixtures',()=>{
  for(const x of [-2.000001,-2,2,2.000001]){const r=NORMAL_REFERENCES.find(row=>row.x===x);relative(normalCDF(x).smallerTail,Math.min(Number(r.cdf),Number(r.survival)));}
  close(normalCDF(2+1e-9).value-normalCDF(2-1e-9).value,2e-9*normalDensity(2),3e-16);
});

test('HW5: tail truncation bound follows a checked dominating exponential',()=>{
  for(const z of [2,4,8,10]){
    const r=normalTail(z),bound=normalDensity(z)*Math.exp(-8*z-32)/(z+8);
    relative(r.truncationBound,bound);assert.ok(bound<2e-23);
    // Integrate the omitted integrand independently on [8,12], then bound beyond 12.
    const omitted=compositeSimpson(u=>Math.exp(-z*u-u*u/2),8,12,1024).value*normalDensity(z);
    assert.ok(omitted<=r.truncationBound);
  }
});

test('HW5: quadrature refinement independently corroborates the 32-node tail',()=>{
  for(const z of [2,2.1,3,6,8,10])relative(normalTail(z,32).value,normalTail(z,64).value,2e-14);
});

test('HW5: exact production operation counts distinguish density, quadrature and series work',()=>{
  assert.equal(cdfSimpson(1,128).densityEvaluations,129);assert.equal(cdfSimpson(0).densityEvaluations,0);
  const central=normalCDF(1),tail=normalCDF(-8);assert.equal(central.quadratureEvaluations,0);assert.equal(central.densityEvaluations,0);assert.equal(central.terms,14);
  assert.equal(tail.quadratureEvaluations,32);assert.equal(tail.densityEvaluations,1);assert.equal(tail.terms,0);
});

test('HW5: baseline cancellation and an unfavorable fixed series remain visible',()=>{
  const baseline=cdfSimpson(-10,1024);const expected=Number(NORMAL_REFERENCES.find(row=>row.x===-10).cdf);
  assert.ok(Math.abs((baseline.value-expected)/expected)>0.1);
  const poor=cdfSeriesTerms(-8,32);assert.ok(Math.abs(poor.value-normalCDF(-8).value)>1);assert.equal(poor.terms,32);
});

test('HW5: NIST’s five-place areas agree to their stated rounding precision',()=>{
  for(const row of NIST_AREAS)close(normalCDF(row.x).value-0.5,row.area,0.000005000001);
  assert.equal(NIST_AREAS.find(row=>row.x===1.53).area,0.43699);
});

test('HW5: all numerical work and supported inputs are explicitly bounded',()=>{
  for(const x of [NaN,Infinity,-Infinity,10.01,-10.01,'1',null]){assert.throws(()=>normalCDF(x));assert.throws(()=>cdfSimpson(x));}
  for(const panels of [1,3,0,16386,NaN])assert.throws(()=>compositeSimpson(x=>x,0,1,panels));
  for(const nodes of [1,65,2.5,NaN])assert.throws(()=>gaussLegendreRule(nodes));
  for(const terms of [0,257,2.5])assert.throws(()=>erfSeriesTerms(1,terms));
  for(const z of [1,11,NaN])assert.throws(()=>normalTail(z));
  assert.throws(()=>normalTail(2,32,3));assert.throws(()=>gaussLegendre(()=>NaN,0,1));assert.throws(()=>compositeSimpson(()=>Infinity,0,1));
  assert.throws(()=>sum([1,NaN]));
});

test('HW5: CDF studies are deterministic apart from explicitly omitted wall-clock timings',()=>{
  assert.deepEqual(cdfExperiment(-8,false),cdfExperiment(-8,false));
  const r=cdfExperiment(-8,false);assert.ok(r.reference);assert.equal(r.comparisons.length,15);assert.equal(r.convergence.simpson.length,10);
  assert.ok(r.matchedAccuracy.every(row=>row.hybridPass));
  for(const x of [-10,-8,8,10])assert.equal(r.matchedAccuracy.find(row=>row.x===x).simpsonPanels,null);
  assert.equal(cdfExperiment(1.234,false).reference,null);
});

test('HW5: numerical algorithms have no reference-data import or hidden answer lookup',async()=>{
  for(const file of ['normal-cdf.js','numerical-methods.js']){const source=await read(`docs/homework-5/exercise-2/js/${file}`);assert.doesNotMatch(source,/from\s+['"][^'"\n]*(?:reference|data)|NORMAL_REFERENCES|6\.220960574/);}
  const text=await read('docs/homework-5/exercise-1/js/lebesgue.js');assert.doesNotMatch(text,/histogram|fn\.evaluate\(/);
  assert.equal(format(normalCDF(-8).value),'6.2209606e-16');
});

test('HW5: source regions are actual executed implementations with distinct mathematical roles',async()=>{
  for(const [path,regions]of [
    ['exercise-1/js/functions.js',['analytic-preimages','sinc-preimage','pathological-samples']],
    ['exercise-1/js/riemann.js',['riemann-rule']],['exercise-1/js/lebesgue.js',['layer-cake']],
    ['exercise-2/js/numerical-methods.js',['composite-simpson','erf-series','gauss-legendre']],
    ['exercise-2/js/normal-cdf.js',['direct-normal-tail','hybrid-normal-cdf']],
  ])for(const region of regions)assert.ok(extractCodeRegion(await read(`docs/homework-5/${path}`),region).length>20);
});

test('HW5: single homework card leads to exactly two complete four-section exercise pages',async()=>{
  const home=await read('docs/index.html'),landing=await read('docs/homework-5/index.html');
  assert.equal([...home.matchAll(/href="\.\/homework-5\/"/g)].length,1);assert.equal([...landing.matchAll(/class="homework-card"/g)].length,2);
  for(const exercise of [1,2]){assert.ok(landing.includes(`href="./exercise-${exercise}/"`));const page=await read(`docs/homework-5/exercise-${exercise}/index.html`);assert.equal([...page.matchAll(/class="section-number"/g)].length,4);assert.match(page,/href="\.\.\/">/);}
  assert.deepEqual(TEST_POINTS,[-10,-8,-6,-4,-3,-2,-1,0,1,2,3,4,6,8,10]);
});
