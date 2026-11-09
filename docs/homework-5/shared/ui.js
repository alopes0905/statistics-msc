export const byId=id=>document.getElementById(id);
export function format(value) {
  if(value===null || value===undefined)return '—';
  if(typeof value!=='number')return String(value);
  if(!Number.isFinite(value))throw new Error('A nonfinite result cannot be displayed.');
  if(value===0)return '0';
  return Math.abs(value)<1e-4 || Math.abs(value)>=1e6 ? value.toExponential(7) : Number(value.toPrecision(10)).toString();
}
export function tableRows(id,rows) {
  byId(id).replaceChildren(...rows.map(values=>{
    const row=document.createElement('tr');
    values.forEach(value=>{const cell=document.createElement('td');cell.textContent=format(value);row.append(cell);});return row;
  }));
}
export function microseconds(milliseconds) {
  return milliseconds===0?'Below clock resolution':Number((milliseconds*1000).toPrecision(3)).toString();
}
export function decimalInput(id,label) {
  const field=byId(id),text=field.value.trim();
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) {
    field.setAttribute('aria-invalid','true');throw new RangeError(`${label} must be a finite decimal number.`);
  }
  return Number(text);
}

/** One cancellable worker per exercise. Every edit invalidates old output. */
export function workerForm({url,read,render,clear}) {
  const form=byId('experiment-form'),status=byId('experiment-status'),run=byId('run'),cancel=byId('cancel');
  let worker=null,generation=0;
  const available=typeof Worker!=='undefined';
  function message(text,state='ready'){status.textContent=text;status.dataset.state=state;}
  function stop(){generation+=1;worker?.terminate();worker=null;run.disabled=!available;cancel.disabled=true;form.setAttribute('aria-busy','false');}
  function calculate(){
    stop();clear();
    form.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
    try{
      const parameters=read(),current=generation;
      worker=new Worker(url,{type:'module'});run.disabled=true;cancel.disabled=false;form.setAttribute('aria-busy','true');message('Calculating and measuring warmed batches…','running');
      worker.addEventListener('message',({data})=>{
        if(current!==generation)return;
        worker.terminate();worker=null;run.disabled=false;cancel.disabled=true;form.setAttribute('aria-busy','false');
        if(data.error){clear();message(data.error,'error');return;}
        try{render(data.result);message('Complete. Results are calculated from the displayed methods; timing is machine-dependent.');}
        catch(error){clear();message(`Could not display results: ${error.message}`,'error');}
      });
      worker.addEventListener('error',event=>{
        if(current!==generation)return;
        event.preventDefault();stop();clear();message('The background calculation failed. Reload and run again.','error');
      });
      worker.postMessage(parameters);
    }catch(error){stop();clear();message(error.message,'error');}
  }
  form.addEventListener('submit',event=>{event.preventDefault();calculate();});
  form.addEventListener('input',()=>{stop();clear();form.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));message('Parameters changed. Run the calculation to update results.');});
  cancel.addEventListener('click',()=>{stop();clear();message('Calculation cancelled.');});
  window.addEventListener('pagehide',()=>worker?.terminate());
  if(!available){message('Web Workers are unavailable. The mathematics and source links remain readable.','error');return;}
  run.disabled=false;calculate();
}
