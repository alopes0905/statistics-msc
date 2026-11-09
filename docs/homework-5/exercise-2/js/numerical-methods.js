import { integer, sum } from '../../shared/numerics.js';

// #region composite-simpson
/** Even panels; the signed width also handles reversed integration limits. */
export function compositeSimpson(f,a,b,panels=128) {
  integer(panels,2,16384,'Simpson panels');
  if (panels%2 || typeof f!=='function' || !Number.isFinite(a) || !Number.isFinite(b)) throw new RangeError('Simpson requires finite endpoints and an even panel count.');
  if (a===b) return {value:0,evaluations:0};
  const h=(b-a)/panels;
  const terms=Array.from({length:panels+1},(_,i)=>{
    const value=f(i===panels ? b : a+i*h);
    if (!Number.isFinite(value)) throw new RangeError('A quadrature evaluation was nonfinite.');
    return value*(i===0 || i===panels ? 1 : i%2 ? 4 : 2);
  });
  const value=h/3*sum(terms);
  if (!Number.isFinite(value)) throw new RangeError('The quadrature result was nonfinite.');
  return {value,evaluations:panels+1};
}
// #endregion composite-simpson

const cache=new Map();
function legendre(n,x) {
  let previous=1,current=x;
  for(let k=2;k<=n;k+=1) { const next=((2*k-1)*x*current-(k-1)*previous)/k;previous=current;current=next; }
  return {value:current,derivative:n*(x*current-previous)/(x*x-1)};
}

// #region gauss-legendre
/** Generate, rather than copy, nodes and weights. Newton work is bounded;
 * immutable cached rules make subsequent integrations require n evaluations. */
export function gaussLegendreRule(n=32) {
  integer(n,2,64,'Gauss–Legendre nodes');
  if(cache.has(n)) return cache.get(n);
  const nodes=Array(n),weights=Array(n);let setupEvaluations=0;
  for(let i=0;i<Math.ceil(n/2);i+=1) {
    let x=Math.cos(Math.PI*(i+0.75)/(n+0.5)),converged=false;
    for(let iteration=0;iteration<50;iteration+=1) {
      const p=legendre(n,x);setupEvaluations+=1;
      const next=x-p.value/p.derivative;
      if(Math.abs(next-x)<=4*Number.EPSILON) {x=next;converged=true;break;}
      x=next;
    }
    if(!converged) throw new Error('Gauss–Legendre node iteration failed.');
    const p=legendre(n,x);setupEvaluations+=1;
    const weight=2/((1-x*x)*p.derivative*p.derivative);
    nodes[i]=-x;nodes[n-1-i]=x;weights[i]=weight;weights[n-1-i]=weight;
  }
  const rule=Object.freeze({nodes:Object.freeze(nodes),weights:Object.freeze(weights),setupEvaluations});
  cache.set(n,rule);return rule;
}

export function gaussLegendre(f,a,b,n=32) {
  if(typeof f!=='function' || !Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError('Use a function and finite quadrature endpoints.');
  const rule=gaussLegendreRule(n),half=(b-a)/2,middle=a+half;
  const value=half*sum(rule.nodes.map((x,i)=>rule.weights[i]*f(middle+half*x)));
  if(!Number.isFinite(value)) throw new RangeError('The quadrature result was nonfinite.');
  return {value,evaluations:n};
}
// #endregion gauss-legendre

// #region erf-series
/** Alternating erf series, effective here only for |z|≤√2. The next-term
 * bound is a truncation bound in exact arithmetic, not a roundoff guarantee. */
export function erfSeries(z,{tolerance=2e-17,maxTerms=200}={}) {
  if(!Number.isFinite(z) || Math.abs(z)>Math.SQRT2 || !Number.isFinite(tolerance) || tolerance<1e-18 || tolerance>1e-4) throw new RangeError('Use |z|≤√2 and tolerance 1e−18..1e−4.');
  integer(maxTerms,1,256,'Series term limit');
  if(z===0) return {value:0,terms:0,truncationBound:0};
  let term=z,total=0,correction=0;
  const factor=2/Math.sqrt(Math.PI);
  for(let k=0;k<maxTerms;k+=1) {
    const adjusted=term-correction,next=total+adjusted;
    correction=(next-total)-adjusted;total=next;
    const following=term*(-z*z)*(2*k+1)/((k+1)*(2*k+3));
    if(Math.abs(following)<=Math.abs(term) && factor*Math.abs(following)<=tolerance) {
      return {value:factor*total,terms:k+1,truncationBound:factor*Math.abs(following)};
    }
    term=following;
  }
  throw new Error('The error-function series did not converge within its term limit.');
}
// #endregion erf-series

/** Fixed-term series intentionally exposes truncation/cancellation, including
 * outside the central region. This is not the main probability algorithm. */
export function erfSeriesTerms(z,terms) {
  integer(terms,1,256,'Fixed series terms');
  if(!Number.isFinite(z) || Math.abs(z)>10/Math.SQRT2) throw new RangeError('The experiment supports |x|≤10.');
  let term=z;const values=[];
  for(let k=0;k<terms;k+=1) {
    values.push(term);term*=(-z*z)*(2*k+1)/((k+1)*(2*k+3));
  }
  return {value:2/Math.sqrt(Math.PI)*sum(values),terms};
}
