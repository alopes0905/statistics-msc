import { frame,node,polyline,renderErrors } from '../../shared/charts.js';
export {renderErrors};

/** These diagrams illustrate solved sets; they are not the numerical algorithm
 * or its operation counts. At most 24 rectangles and 10 levels are displayed. */
export function renderPartitions(domainContainer,rangeContainer,fn,config) {
  const [a,b]=fn.domain,rectangles=Math.min(config.K,24),height=fn.improper?config.cutoff:fn.height;
  const curvePoints=Array.from({length:241},(_,i)=>{
    const x=a+(b-a)*(fn.improper?(i+0.5)/241:i/240);return [x,fn.evaluate(x)];
  });
  const top=Math.max(height,...curvePoints.map(point=>point[1]))*1.08;
  const domain=frame(domainContainer,'Partitioning the domain','A representative domain partition with function graph and sampled rectangle heights. The diagram is limited to 24 cells; the reported sum uses the selected full K.',[a,b],[0,top],'Domain x','Function value');
  const offset=config.rule==='left'?0:config.rule==='right'?1:0.5;
  for(let i=0;i<rectangles;i+=1){
    const left=a+i*(b-a)/rectangles,right=a+(i+1)*(b-a)/rectangles;
    const value=fn.evaluate(left+offset*(right-left));
    domain.svg.append(node('rect',{x:domain.x(left),y:domain.y(value),width:domain.x(right)-domain.x(left),height:domain.bottom-domain.y(value),class:'riemann-rectangle'}));
  }
  polyline(domain,curvePoints,'function-line');
  const range=frame(rangeContainer,'Partitioning values through preimages','Each horizontal segment shows a genuine superlevel preimage at its stated threshold. The total segment length is M(t); disjoint intervals are retained. Numerical interval lengths follow in the preimage table.',[a,b],[0,height*1.08],'Preimage x','Threshold t');
  const levels=Array.from({length:Math.min(config.K,10)},(_,i)=>(i+0.5)*height/Math.min(config.K,10));
  const rows=levels.map(t=>({t,...fn.measure(t)}));
  rows.forEach(row=>row.intervals.forEach(([left,right])=>range.svg.append(node('line',{x1:range.x(left),x2:range.x(right),y1:range.y(row.t),y2:range.y(row.t),class:'preimage-segment'}))));
  return rows;
}
