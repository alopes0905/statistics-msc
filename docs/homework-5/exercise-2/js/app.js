import { validateX } from './normal-cdf.js';
import { renderErrors } from '../../shared/charts.js';
import { byId,format,tableRows,decimalInput,workerForm,microseconds } from '../../shared/ui.js';

let result=null,resizeTimer;
const probability=value=>value.toPrecision(16);
const outputIds=['selected-rows','reference-rows','baseline-rows','convergence-rows','matched-rows','nist-rows','convergence-chart'];
function clear(){result=null;byId('results').hidden=true;outputIds.forEach(id=>byId(id).replaceChildren());}
function chart(){if(result)renderErrors(byId('convergence-chart'),[
  {name:'Simpson',points:result.convergence.simpson.map(row=>[row.work,row.error])},
  {name:'Fixed-term erf series',points:result.convergence.series.map(row=>[row.work,row.error])},
],'Simpson panels / series terms (log)');}
function work(row){return `${row.densityEvaluations} / ${row.quadratureEvaluations} / ${row.terms}`;}
function display(data){
  result=data;byId('results').hidden=false;
  const target=data.reference?Number(data.reference.cdf):data.selected[0].value;
  byId('reference-description').textContent=data.reference?`x=${data.x}. Errors use the independently generated 80-decimal-digit reference, rounded to a browser Number: Φ(x)=${format(target)}.`:`x=${data.x}. There is no stored independent reference at this input. The displayed differences and convergence plot use the hybrid value as a cross-method comparison, not a verified accuracy claim.`;
  tableRows('selected-rows',data.selected.map(row=>row.unavailable?[row.name,row.unavailable,'—','—','—']: [row.name,probability(row.value),Math.abs(row.value-target),work(row),microseconds(row.timing.medianMs)]));
  const main=data.selected[0];
  const boundLabel=Math.abs(data.x)<=2?'Series next-term truncation bound':'Omitted u>8 probability bound';
  byId('tail-result').textContent=`Hybrid Φ(x)=${probability(main.value)}; directly retained smaller tail=${probability(main.smallerTail)}; survival probability Q(x)=${probability(main.survival)}. Method: ${main.method}. ${boundLabel}=${format(main.truncationBound)}; roundoff${Math.abs(data.x)>2?' and quadrature error are':' is'} additional.`;
  byId('series-note').textContent=Math.abs(data.x)>2?'The fixed-term series below deliberately runs outside its favorable central region. Large or negative raw results expose cancellation/truncation; the production hybrid does not use that calculation here.':'The central series converges quickly, until floating-point/reference precision limits the reported difference.';
  tableRows('reference-rows',data.comparisons.map(row=>{const main=row.methods[0];return [row.x,probability(main.value),probability(Number(row.reference.cdf)),main.absoluteError,main.relativeError,main.relativeTailError,work(main),microseconds(main.timing.medianMs)];}));
  tableRows('baseline-rows',data.comparisons.flatMap(row=>row.methods.slice(1).map(method=>[row.x,method.method,probability(method.value),probability(Number(row.reference.cdf)),method.absoluteError,method.relativeError,method.relativeTailError,work(method),microseconds(method.timing.medianMs)])));
  tableRows('convergence-rows',Object.entries(data.convergence).flatMap(([method,rows])=>rows.map(row=>[method,row.work,row.value,row.error,work(row)])));
  tableRows('matched-rows',data.matchedAccuracy.map(row=>[row.x,row.criterion,row.hybridPass?'Pass':'Fail',`${row.hybridDensity} / ${row.hybridQuadrature} / ${row.hybridTerms}`,row.simpsonPanels??'Not reached ≤4096',row.simpsonEvaluations]));
  tableRows('nist-rows',data.nist.map(row=>[row.x,row.publishedArea,row.computedArea,Math.abs(row.publishedArea-row.computedArea)]));
  byId('setup-note').textContent=`The cached 32-point rule requires ${data.quadratureSetup} Legendre-polynomial evaluations once per worker run. Warmed timings exclude that setup, page rendering and the worker startup.`;
  chart();
}
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(chart,100);});
workerForm({url:new URL('./experiment-worker.js',import.meta.url),clear,render:display,
  read:()=>({x:validateX(decimalInput('cdf-x','Normal CDF argument x'))})});
