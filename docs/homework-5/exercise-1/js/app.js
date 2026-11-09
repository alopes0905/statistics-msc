import { getFunction } from './functions.js';
import { validateConfig } from './experiments.js';
import { renderPartitions,renderErrors } from './charts.js';
import { byId,format,tableRows,decimalInput,workerForm,microseconds } from '../../shared/ui.js';

let result=null,resizeTimer;
const outputIds=['selected-rows','convergence-rows','cost-rows','preimage-rows','cutoff-rows','pathology-rows','domain-chart','range-chart','error-chart'];
function clear(){result=null;byId('results').hidden=true;byId('comparison-results').hidden=true;byId('singular-results').hidden=true;outputIds.forEach(id=>byId(id).replaceChildren());}
function updateControls(){
  const fn=getFunction(byId('function').value);
  byId('cutoff').disabled=!fn.improper;
  byId('rule').querySelector('[value="left"]').disabled=Boolean(fn.improper);
  if(fn.improper && byId('rule').value==='left')byId('rule').value='midpoint';
  byId('function-description').textContent=`${fn.formula}; ${fn.classification} ${fn.limitations}`;
}
function charts(){
  if(!result)return;
  const fn=getFunction(result.config.id);
  const levels=renderPartitions(byId('domain-chart'),byId('range-chart'),fn,result.config);
  tableRows('preimage-rows',levels.map(row=>[row.t,row.intervals.map(([a,b])=>`(${format(a)}, ${format(b)})`).join(' ∪ ')||'Empty',row.value,row.rootIterations]));
  renderErrors(byId('error-chart'),[
    {name:'Domain sum',points:result.rows.map(row=>[row.K,row.domainError])},
    {name:fn.improper?'Layer-cake quadrature (truncated target)':'Layer-cake midpoint',points:result.rows.map(row=>[row.K,row.rangeError])},
  ]);
}
function display(data){
  result=data;const fn=getFunction(data.config.id),selected=data.selected;
  byId('results').hidden=false;byId('comparison-results').hidden=false;
  byId('result-description').textContent=`${fn.name}; K=${data.config.K}; ${data.config.rule} sampling. Domain reference=${format(fn.reference)}. ${fn.measureFormula}.`;
  byId('diagram-note').textContent=fn.improper?'The curve omits x=0 (it begins at 1/482); it is unbounded there. Domain rectangles use at most 24 illustrative cells; range lines use at most 10 thresholds. All reported algorithms use the full selected K.':'Diagrams use at most 24 illustrative domain cells and 10 superlevels. All reported algorithms use the full selected K. Endpoints of preimage intervals do not change their lengths.';
  tableRows('selected-rows',[
    ['Domain sum',selected.domain.value,fn.reference,selected.domainError],
    ['Layer-cake lower',selected.range.lower,selected.range.target,Math.abs(selected.range.lower-selected.range.target)],
    ['Layer-cake midpoint',selected.range.midpoint,selected.range.target,selected.rangeError],
    ['Layer-cake upper',selected.range.upper,selected.range.target,Math.abs(selected.range.upper-selected.range.target)],
  ]);
  byId('range-note').textContent=fn.improper?`Range target is the truncated integral 2−1/T=${format(selected.range.target)} at T=${format(data.config.cutoff)}; omitted tail=${format(selected.range.omittedTail)}. Midpoint error against the full integral 2 is ${format(selected.totalRangeError)}. This is separate from range quadrature error.`:`Enclosure width U−L=${format(selected.range.enclosureWidth)}. Aggregate midpoint root-bracket uncertainty=${format(selected.range.rootUncertainty)}; ordinary floating-point roundoff is additional.`;
  byId('convergence-description').textContent=fn.improper?'Domain error is against the full improper integral 2. Range error is quadrature error against 2−1/T, with T fixed at the selected cutoff; these are different targets.':'Both absolute errors are against the same exact or independently verified integral. The enclosure width is U−L; finite errors can depend on partition alignment.';
  tableRows('convergence-rows',data.rows.map(row=>[row.K,row.domain.value,row.range.lower,row.range.midpoint,row.range.upper,row.domainError,row.rangeError,row.range.enclosureWidth]));
  tableRows('cost-rows',data.rows.map(row=>[row.K,row.domain.fEvaluations,row.range.measureEvaluations,row.range.fEvaluations,row.range.rootIterations,microseconds(row.domainTiming.medianMs),microseconds(row.rangeTiming.medianMs),`${row.domainTiming.repetitions} / ${row.rangeTiming.repetitions}`]));
  byId('empirical-summary').textContent=`From K=${data.rows[0].K} to ${data.rows.at(-1).K}, domain absolute error changes from ${format(data.rows[0].domainError)} to ${format(data.rows.at(-1).domainError)}, and layer-cake quadrature error from ${format(data.rows[0].rangeError)} to ${format(data.rows.at(-1).rangeError)}. These are observed numerical errors, not a universal ranking of integration methods.`;
  byId('singular-results').hidden=!fn.improper;
  tableRows('cutoff-rows',data.cutoffStudy.map(row=>[row.T,row.target,row.midpoint,row.omittedTail,Math.abs(row.midpoint-row.target),Math.abs(row.midpoint-2)]));
  tableRows('pathology-rows',data.pathological.map(row=>[row.K,row.dirichlet.rationalSum,row.dirichlet.irrationalSum,row.dirichlet.lowerDarboux,row.dirichlet.upperDarboux,row.thomae.rationalSum]));
  charts();
}
byId('function').addEventListener('input',updateControls);updateControls();
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(charts,100);});
workerForm({url:new URL('./experiment-worker.js',import.meta.url),clear,render:display,
  read:()=>validateConfig({id:byId('function').value,K:decimalInput('partitions','Partitions K'),rule:byId('rule').value,cutoff:getFunction(byId('function').value).improper?decimalInput('cutoff','Value cutoff T'):8})});
