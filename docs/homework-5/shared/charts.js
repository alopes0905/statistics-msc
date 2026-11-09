const namespace='http://www.w3.org/2000/svg';
export const numeric=value=>{
  if(value!==0 && (Math.abs(value)<0.001 || Math.abs(value)>=100000))return Number(value.toPrecision(3)).toExponential();
  return Number.isInteger(value)?String(value):Number(value.toPrecision(3)).toString();
};
export function node(tag,attributes={},text='') {
  const element=document.createElementNS(namespace,tag);
  Object.entries(attributes).forEach(([key,value])=>element.setAttribute(key,String(value)));
  if(text)element.textContent=text;return element;
}

export function frame(container,title,description,xDomain,yDomain,xLabel,yLabel,log=false) {
  const width=Math.max(220,Math.round(container.getBoundingClientRect().width||650));
  const height=300,left=58,right=width-18,top=30,bottom=height-48;
  const transform=log?Math.log10:value=>value;
  const scale=(domain,a,b)=>value=>a+(transform(value)-transform(domain[0]))/(transform(domain[1])-transform(domain[0]))*(b-a);
  const x=scale(xDomain,left,right),y=scale(yDomain,bottom,top);
  const svg=node('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-labelledby':`${container.id}-title ${container.id}-desc`});
  svg.append(node('title',{id:`${container.id}-title`},title),node('desc',{id:`${container.id}-desc`},description));
  function ticks(domain) {
    if(!log)return Array.from({length:4},(_,i)=>domain[0]+i/3*(domain[1]-domain[0]));
    const lo=Math.ceil(Math.log10(domain[0])),hi=Math.floor(Math.log10(domain[1])),stride=Math.max(1,Math.ceil((hi-lo)/4));
    const values=[domain[0]];
    for(let exponent=lo;exponent<=hi;exponent+=stride)values.push(10**exponent);
    values.push(domain[1]);return [...new Set(values)];
  }
  ticks(yDomain).forEach(value=>svg.append(node('line',{x1:left,x2:right,y1:y(value),y2:y(value),class:'grid-line'}),node('text',{x:left-6,y:y(value)+4,'text-anchor':'end'},numeric(value))));
  let xTicks=ticks(xDomain).filter(value=>value===xDomain[0] || value===xDomain[1] || (x(value)-left>42 && right-x(value)>42));
  if(width<360&&xTicks.length>3)xTicks=[xTicks[0],xTicks[Math.floor(xTicks.length/2)],xTicks.at(-1)];
  xTicks.forEach((value,i)=>svg.append(node('text',{x:x(value),y:bottom+20,'text-anchor':i===0?'start':i===xTicks.length-1?'end':'middle'},numeric(value))));
  svg.append(node('text',{x:left,y:15},yLabel),node('text',{x:(left+right)/2,y:height-4,'text-anchor':'middle'},xLabel));
  container.replaceChildren(svg);return {svg,x,y,bottom,top,left,right};
}

export function polyline(chart,points,className) {
  chart.svg.append(node('polyline',{points:points.map(([x,y])=>`${chart.x(x)},${chart.y(y)}`).join(' '),class:className}));
}

/** Positive errors only. Zero observations stay zero in the numerical table. */
export function renderErrors(container,series,xLabel='Partitions K (log)') {
  const all=series.flatMap(row=>row.points),positive=all.filter(point=>point[1]>0);
  if(positive.length===0) {
    const message=document.createElement('p');message.className='legend';
    message.textContent='All reported differences are zero at the available floating-point/reference precision. No logarithm of zero is plotted; the exact results remain in the table.';
    container.replaceChildren(message);container.dataset.state='zero';return;
  }
  const xs=all.map(point=>point[0]);
  let xLow=Math.min(...xs),xHigh=Math.max(...xs),low=10**Math.floor(Math.log10(Math.min(...positive.map(p=>p[1])))),high=10**Math.ceil(Math.log10(Math.max(...positive.map(p=>p[1]))));
  if(xLow===xHigh)xLow/=2;if(low===high){low/=10;high*=10;}
  const chart=frame(container,'Numerical convergence','Both axes are logarithmic. Separate series identify the numerical methods. Zero reported errors are omitted, without replacing them by artificial positive values. Numerical values follow in the table.',[xLow,xHigh],[low,high],xLabel,'Absolute difference (log)',true);
  series.forEach((row,i)=>{
    let segment=[];
    function flush(){if(segment.length)polyline(chart,segment,`error-line series-${i}`);segment=[];}
    row.points.forEach(([work,error])=>{
      if(error<=0){flush();return;}
      segment.push([work,error]);
      const marker=node('circle',{cx:chart.x(work),cy:chart.y(error),r:3.5,class:`error-point series-${i}`,'data-work':work,'data-error':error});
      marker.append(node('title',{},`${row.name}, work=${work}: ${error}`));chart.svg.append(marker);
    });flush();
  });
  const omitted=all.length-positive.length;
  if(omitted){const message=document.createElement('p');message.className='legend';message.textContent=`${omitted} zero difference(s) omitted from the log plot; see the table.`;container.append(message);}
  container.dataset.state='ready';
}
