import { normalCDF,cdfSimpson,cdfSeries,cdfSeriesTerms,validateX } from './normal-cdf.js';
import { NORMAL_REFERENCES,NIST_AREAS } from '../../data/normal-reference.js';
import { benchmark } from '../../shared/numerics.js';
import { gaussLegendreRule } from './numerical-methods.js';

export const TEST_POINTS=Object.freeze([-10,-8,-6,-4,-3,-2,-1,0,1,2,3,4,6,8,10]);
export const SIMPSON_PANELS=Object.freeze([8,16,32,64,128,256,512,1024,2048,4096]);
export const SERIES_TERMS=Object.freeze([1,2,4,8,16,32,64,128]);

function errors(result,reference) {
  const expected=Number(reference.cdf),absoluteError=Math.abs(result.value-expected);
  const smallReference=Math.min(expected,Number(reference.survival));
  const smaller=result.smallerTail ?? (reference.x<0 ? result.value : 1-result.value);
  return {absoluteError,relativeError:absoluteError/expected,relativeTailError:Math.abs(smaller-smallReference)/smallReference};
}

export function cdfExperiment(x,timing=true) {
  validateX(x);
  const hybrid=normalCDF(x),reference=NORMAL_REFERENCES.find(row=>row.x===x) ?? null;
  const target=reference ? Number(reference.cdf) : hybrid.value;
  const measure=calculate=>timing ? benchmark(calculate) : null;
  const selected=[{name:'Hybrid',...hybrid,timing:measure(()=>normalCDF(x))},
    {name:'Simpson · 128 panels',...cdfSimpson(x,128),timing:measure(()=>cdfSimpson(x,128))},
    Math.abs(x)<=2 ? {name:'Central erf series',...cdfSeries(x),timing:measure(()=>cdfSeries(x))}
      : {name:'Central erf series',unavailable:'Outside its supported central region |x|≤2.'}];
  const convergence={
    simpson:SIMPSON_PANELS.map(work=>({work,...cdfSimpson(x,work)})),
    series:SERIES_TERMS.map(work=>({work,...cdfSeriesTerms(x,work)})),
  };
  for(const rows of Object.values(convergence)) rows.forEach(row=>{row.error=Math.abs(row.value-target);});
  const comparisons=TEST_POINTS.map(point=>{
    const ref=NORMAL_REFERENCES.find(row=>row.x===point);
    const algorithms=[['Hybrid',()=>normalCDF(point)],['Simpson · 128',()=>cdfSimpson(point,128)]];
    if(Math.abs(point)<=2) algorithms.push(['Central series',()=>cdfSeries(point)]);
    return {x:point,reference:ref,methods:algorithms.map(([method,calculate])=>{
      const result=calculate();return {method,...result,...errors(result,ref),timing:measure(calculate)};
    })};
  });
  const matchedAccuracy=TEST_POINTS.map(point=>{
    const ref=NORMAL_REFERENCES.find(row=>row.x===point),expected=Number(ref.cdf),small=Math.min(expected,Number(ref.survival)),tail=small<1e-8;
    const tolerance=tail ? small*1e-10 : 1e-12;
    const match=SIMPSON_PANELS.map(panels=>({panels,...cdfSimpson(point,panels)})).find(row=>Math.abs((tail ? point<0 ? row.value : 1-row.value : row.value)-(tail ? small : expected))<=tolerance);
    const main=normalCDF(point);
    return {x:point,criterion:tail?'small-tail relative ≤ 1e−10':'CDF absolute ≤ 1e−12',hybridPass:Math.abs((tail ? main.smallerTail : main.value)-(tail ? small : expected))<=tolerance,
      simpsonPanels:match?.panels ?? null,simpsonEvaluations:match?.densityEvaluations ?? null,
      hybridDensity:main.densityEvaluations,hybridQuadrature:main.quadratureEvaluations,hybridTerms:main.terms};
  });
  const nist=NIST_AREAS.map(row=>({x:row.x,publishedArea:row.area,computedArea:normalCDF(row.x).value-0.5}));
  return {x,reference,selected,convergence,comparisons,matchedAccuracy,nist,quadratureSetup:gaussLegendreRule(32).setupEvaluations};
}
