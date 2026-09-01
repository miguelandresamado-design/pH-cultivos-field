(function(){
  'use strict';

  const Logic=globalThis.PhFieldLogic;
  const STORE_KEY='ph-cultivos-field.journeys.v1';
  const DRAFT_KEY='ph-cultivos-field.draft.v1';
  const YINMIK_SERVICE='0000ff01-0000-1000-8000-00805f9b34fb';
  const YINMIK_MEASUREMENT='0000ff02-0000-1000-8000-00805f9b34fb';

  const farms=[
    {
      id:'FIN-001',name:'Finca Demostración 1',
      lots:[
        {id:'LOT-001',name:'Lote 1',areaHa:1.8,plantingYear:2021},
        {id:'LOT-002',name:'Lote 2',areaHa:2.7,plantingYear:2017,renewalYear:2024}
      ]
    },
    {
      id:'FIN-002',name:'Finca Demostración 2',
      lots:[{id:'LOT-003',name:'Lote 3',areaHa:1.2,plantingYear:2020}]
    }
  ];

  const elements={
    stepLabel:document.getElementById('step-label'),
    screens:[document.getElementById('setup-screen'),document.getElementById('capture-screen'),document.getElementById('result-screen')],
    farmSelect:document.getElementById('farm-select'),lotSelect:document.getElementById('lot-select'),
    planTitle:document.getElementById('plan-title'),planMeta:document.getElementById('plan-meta'),startButton:document.getElementById('start-button'),
    resumeBanner:document.getElementById('resume-banner'),resumeText:document.getElementById('resume-text'),resumeButton:document.getElementById('resume-button'),
    historyCount:document.getElementById('history-count'),historyEmpty:document.getElementById('history-empty'),historyList:document.getElementById('history-list'),
    captureBack:document.getElementById('capture-back'),pointNumber:document.getElementById('point-number'),pointTarget:document.getElementById('point-target'),captureLot:document.getElementById('capture-lot'),
    connectionBadge:document.getElementById('connection-badge'),readingState:document.getElementById('reading-state'),liveValue:document.getElementById('live-value'),liveTemperature:document.getElementById('live-temperature'),scaleMarker:document.getElementById('scale-marker'),
    connectButton:document.getElementById('connect-button'),disconnectButton:document.getElementById('disconnect-button'),bluetoothStatus:document.getElementById('bluetooth-status'),
    manualPh:document.getElementById('manual-ph'),manualButton:document.getElementById('manual-button'),progressCount:document.getElementById('progress-count'),progressFill:document.getElementById('progress-fill'),
    gpsStatus:document.getElementById('gps-status'),savePointButton:document.getElementById('save-point-button'),finishButton:document.getElementById('finish-button'),
    resultBack:document.getElementById('result-back'),resultLot:document.getElementById('result-lot'),resultPh:document.getElementById('result-ph'),resultCategory:document.getElementById('result-category'),resultMarker:document.getElementById('result-marker'),
    resultRange:document.getElementById('result-range'),resultAdequate:document.getElementById('result-adequate'),technicalText:document.getElementById('technical-text'),saveJourneyButton:document.getElementById('save-journey-button')
  };

  let journeys=[];
  let draft=null;
  let currentReading=null;
  let bluetoothDevice=null;
  let bluetoothCharacteristic=null;
  let bluetoothPollTimer=null;
  let bluetoothReadPending=false;
  let savingPoint=false;

  function id(){
    return globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function'?globalThis.crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function selectedFarm(){return farms.find(farm=>farm.id===elements.farmSelect.value)||farms[0];}
  function selectedLot(){const farm=selectedFarm();return farm.lots.find(lot=>lot.id===elements.lotSelect.value)||farm.lots[0];}
  function farmById(farmId){return farms.find(farm=>farm.id===farmId);}
  function lotById(farm,lotId){return farm&&farm.lots.find(lot=>lot.id===lotId);}

  function loadData(){
    try{
      const stored=JSON.parse(localStorage.getItem(STORE_KEY));
      journeys=stored&&stored.schemaVersion===1&&Array.isArray(stored.journeys)?stored.journeys:[];
    }catch(error){journeys=[];}
    try{
      const storedDraft=JSON.parse(localStorage.getItem(DRAFT_KEY));
      draft=storedDraft&&storedDraft.schemaVersion===1&&Array.isArray(storedDraft.points)?storedDraft:null;
    }catch(error){draft=null;}
  }

  function persistJourneys(){localStorage.setItem(STORE_KEY,JSON.stringify({schemaVersion:1,journeys}));}
  function persistDraft(){if(draft)localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));else localStorage.removeItem(DRAFT_KEY);}

  function showScreen(index){
    elements.screens.forEach((screen,screenIndex)=>{screen.hidden=screenIndex!==index;});
    elements.stepLabel.textContent=`${index+1} de 3`;
    if(index===1)startBluetoothPolling();else stopBluetoothPolling();
    globalThis.scrollTo({top:0,behavior:'smooth'});
  }

  function populateFarms(){
    elements.farmSelect.replaceChildren(...farms.map(farm=>new Option(`${farm.id} · ${farm.name}`,farm.id)));
    populateLots();
  }

  function populateLots(){
    const farm=selectedFarm();
    elements.lotSelect.replaceChildren(...farm.lots.map(lot=>new Option(`${lot.name} · ${String(lot.areaHa).replace('.',',')} ha · Siembra ${lot.plantingYear}`,lot.id)));
    updatePlan();
  }

  function updatePlan(){
    const lot=selectedLot();
    const target=Logic.targetForArea(lot.areaHa);
    elements.planTitle.textContent=`${target} puntos en zigzag`;
    elements.planMeta.textContent='GPS y temperatura se guardan automáticamente';
  }

  function renderResume(){
    if(!draft){elements.resumeBanner.hidden=true;return;}
    const farm=farmById(draft.farmId);
    const lot=lotById(farm,draft.lotId);
    if(!farm||!lot){draft=null;persistDraft();elements.resumeBanner.hidden=true;return;}
    elements.resumeText.textContent=`${lot.name} · ${draft.points.length}/${draft.target} puntos`;
    elements.resumeBanner.hidden=false;
  }

  function formatDate(iso){
    const date=new Date(iso);
    return Number.isNaN(date.getTime())?'Fecha no disponible':new Intl.DateTimeFormat('es-CO',{dateStyle:'short',timeStyle:'short'}).format(date);
  }

  function renderHistory(){
    elements.historyCount.textContent=String(journeys.length);
    elements.historyEmpty.hidden=journeys.length>0;
    elements.historyList.replaceChildren();
    journeys.forEach(journey=>{
      const item=document.createElement('div');item.className='history-item';
      const title=document.createElement('div');title.className='history-title';
      const name=document.createElement('span');name.textContent=`${journey.farmName} · ${journey.lotName}`;
      const ph=document.createElement('span');ph.textContent=`pH ${Logic.formatPh(journey.summary.representative)}`;
      const meta=document.createElement('div');meta.className='history-meta';meta.textContent=`${journey.points.length} puntos · ${journey.summary.category} · ${formatDate(journey.completedAt)}`;
      const controls=document.createElement('div');controls.className='history-actions';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='text-button';toggle.textContent='Ver puntos';
      const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='secondary-button compact-button';exportButton.textContent='Exportar CSV';
      const detail=document.createElement('div');detail.className='point-detail';detail.hidden=true;
      (journey.points||[]).forEach(point=>detail.appendChild(renderPoint(journey,point)));
      const exportHint=document.createElement('p');exportHint.className='export-hint';exportHint.textContent='En iPhone, selecciona “Guardar en Archivos” en la hoja de compartir.';
      detail.appendChild(exportHint);
      toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;toggle.textContent=detail.hidden?'Ver puntos':'Ocultar puntos';});
      exportButton.addEventListener('click',()=>exportJourney(journey));
      controls.append(toggle,exportButton);
      title.append(name,ph);item.append(title,meta,controls,detail);elements.historyList.appendChild(item);
    });
  }

  function mapUrl(point){
    const latitude=point.location.latitude;const longitude=point.location.longitude;
    const apple=/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
    return apple
      ?`https://maps.apple.com/?ll=${encodeURIComponent(`${latitude},${longitude}`)}&q=${encodeURIComponent(`Punto ${point.sequence}`)}`
      :`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }

  function renderPoint(journey,point){
    const row=document.createElement('div');row.className='point-row';
    const head=document.createElement('div');head.className='point-head';
    const sequence=document.createElement('strong');sequence.textContent=`Punto ${point.sequence}`;
    const ph=document.createElement('strong');ph.textContent=`pH ${Logic.formatPh(point.ph)}`;
    head.append(sequence,ph);
    const reading=document.createElement('div');reading.className='point-meta';
    const temperature=Number.isFinite(point.temperatureC)?` · ${Logic.formatPh(point.temperatureC)} °C`:'';
    reading.textContent=`${Logic.classify(point.ph)}${temperature} · ${point.source==='bluetooth'?'Bluetooth':'Manual'}`;
    const gps=document.createElement('div');gps.className='point-gps';
    if(point.location){
      const coordinates=document.createElement('span');
      coordinates.textContent=`${point.location.latitude.toFixed(6)}, ${point.location.longitude.toFixed(6)} · ±${Math.round(point.location.accuracy)} m`;
      const link=document.createElement('a');link.href=mapUrl(point);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir en mapa';
      gps.append(coordinates,link);
    }else{gps.textContent='Sin ubicación GPS';}
    row.append(head,reading,gps);
    return row;
  }

  async function exportJourney(journey){
    const csv=Logic.buildJourneyCsv(journey);const filename=Logic.journeyFilename(journey);
    if(typeof File==='function'&&navigator.share){
      const file=new File([csv],filename,{type:'text/csv;charset=utf-8'});
      if(!navigator.canShare||navigator.canShare({files:[file]})){
        try{await navigator.share({files:[file],title:`Muestreo ${journey.lotName}`});return;}
        catch(error){if(error&&error.name==='AbortError')return;}
      }
    }
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    globalThis.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function startJourney(){
    const farm=selectedFarm();const lot=selectedLot();
    draft={schemaVersion:1,id:id(),farmId:farm.id,lotId:lot.id,target:Logic.targetForArea(lot.areaHa),startedAt:new Date().toISOString(),points:[]};
    persistDraft();openCapture();
  }

  function openCapture(){
    if(!draft)return;
    currentReading=null;
    updateCapture();
    showScreen(1);
  }

  function updateCapture(){
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);
    const completed=draft.points.length;
    elements.pointNumber.textContent=String(Math.min(completed+1,draft.target));
    elements.pointTarget.textContent=String(draft.target);
    elements.captureLot.textContent=`${farm.name} · ${lot.name}`;
    elements.progressCount.textContent=`${completed}/${draft.target}`;
    elements.progressFill.style.width=`${Math.min(100,(completed/draft.target)*100)}%`;
    elements.finishButton.disabled=completed<draft.target;
    elements.finishButton.textContent=completed<draft.target?`Faltan ${draft.target-completed} puntos`:'Finalizar muestreo';
    elements.savePointButton.disabled=!currentReading||completed>=draft.target;
    if(completed>=draft.target){
      elements.liveValue.textContent='Recorrido completo';elements.liveTemperature.textContent='Ya puedes finalizar el muestreo';elements.scaleMarker.hidden=true;
    }else if(!currentReading){
      elements.liveValue.textContent='—';elements.liveTemperature.textContent='Temperatura no disponible';elements.readingState.textContent='Esperando lectura';elements.scaleMarker.hidden=true;
    }
  }

  function useReading(reading){
    if(!draft||draft.points.length>=draft.target)return;
    currentReading=reading;
    elements.liveValue.textContent=`pH ${Logic.formatPh(reading.ph)}`;
    elements.liveTemperature.textContent=Number.isFinite(reading.temperatureC)?`${Logic.formatPh(reading.temperatureC)} °C`:'Lectura manual';
    elements.readingState.textContent=reading.source==='bluetooth'?'Lectura Bluetooth':'Lectura manual';
    elements.scaleMarker.hidden=false;elements.scaleMarker.style.left=`${Logic.scalePosition(reading.ph)}%`;
    elements.savePointButton.disabled=false;
  }

  function useManualReading(){
    const value=elements.manualPh.value.trim().replace(',','.');
    const ph=Number(value);
    if(value===''||!Number.isFinite(ph)||ph<0||ph>14){alert('Ingresa un valor de pH válido entre 0 y 14.');elements.manualPh.focus();return;}
    useReading({ph,temperatureC:null,source:'manual',rawPayload:null,device:null});
  }

  function locationErrorMessage(error){
    if(error&&error.code===1)return 'Punto guardado sin GPS: permiso no concedido.';
    if(error&&error.code===3)return 'Punto guardado sin GPS: la ubicación tardó demasiado.';
    return 'Punto guardado sin GPS.';
  }

  function captureLocation(){
    return new Promise(resolve=>{
      if(!('geolocation' in navigator)){resolve({location:null,message:'Punto guardado sin GPS: ubicación no disponible.'});return;}
      navigator.geolocation.getCurrentPosition(position=>resolve({
        location:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date().toISOString()},
        message:`GPS guardado · precisión aproximada ±${Math.round(position.coords.accuracy)} m.`
      }),error=>resolve({location:null,message:locationErrorMessage(error)}),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
    });
  }

  async function savePoint(){
    if(!currentReading||!draft||draft.points.length>=draft.target)return;
    const reading=currentReading;
    currentReading=null;
    savingPoint=true;
    stopBluetoothPolling();
    elements.savePointButton.disabled=true;elements.savePointButton.textContent='Guardando…';
    const gps=await captureLocation();
    draft.points.push({
      id:id(),sequence:draft.points.length+1,ph:reading.ph,temperatureC:reading.temperatureC,source:reading.source,
      rawPayload:reading.rawPayload,device:reading.device,location:gps.location,recordedAt:new Date().toISOString()
    });
    persistDraft();
    elements.gpsStatus.textContent=gps.message;elements.manualPh.value='';elements.savePointButton.textContent='Guardar punto';
    updateCapture();
    savingPoint=false;
    if(draft.points.length<draft.target&&bluetoothCharacteristic){
      elements.bluetoothStatus.textContent='Punto guardado. Obteniendo la lectura del siguiente punto…';
      startBluetoothPolling();
    }
  }

  function openResult(){
    if(!draft||draft.points.length<draft.target)return;
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);const summary=Logic.summarize(draft.points);
    elements.resultLot.textContent=`${farm.name} · ${lot.name} · ${summary.count} puntos`;
    elements.resultPh.textContent=Logic.formatPh(summary.representative);
    elements.resultCategory.textContent=summary.category;
    elements.resultMarker.style.left=`${Logic.scalePosition(summary.representative)}%`;
    elements.resultRange.textContent=`${Logic.formatPh(summary.minimum)}–${Logic.formatPh(summary.maximum)}`;
    elements.resultAdequate.textContent=`${summary.adequateCount} de ${summary.count}`;
    elements.technicalText.textContent=`Mediana ${Logic.formatPh(summary.representative)} · promedio ${Logic.formatPh(summary.average)} · mínimo ${Logic.formatPh(summary.minimum)} · máximo ${Logic.formatPh(summary.maximum)}.`;
    showScreen(2);
  }

  function saveJourney(){
    if(!draft)return;
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);const summary=Logic.summarize(draft.points);
    journeys.unshift({...draft,farmName:farm.name,lotName:lot.name,areaHa:lot.areaHa,plantingYear:lot.plantingYear,summary,completedAt:new Date().toISOString()});
    persistJourneys();draft=null;persistDraft();renderHistory();renderResume();showScreen(0);
  }

  function setConnected(connected){
    elements.connectionBadge.textContent=connected?'Conectado':'No conectado';
    elements.connectionBadge.classList.toggle('connected',connected);
    elements.connectButton.hidden=connected;elements.disconnectButton.hidden=!connected;
  }

  function handleDisconnected(){
    stopBluetoothPolling();bluetoothCharacteristic=null;setConnected(false);elements.bluetoothStatus.textContent='El medidor se desconectó.';
  }

  function receiveBluetooth(value){
    if(savingPoint)return;
    const decoded=Logic.decodeReading(value);
    if(!decoded){elements.bluetoothStatus.textContent='Se recibió un paquete que no pudo interpretarse.';return;}
    useReading({...decoded,source:'bluetooth',device:{name:bluetoothDevice&&bluetoothDevice.name?bluetoothDevice.name:'YK-S01',serviceUuid:YINMIK_SERVICE,characteristicUuid:YINMIK_MEASUREMENT}});
    elements.bluetoothStatus.textContent='Lectura recibida. Guarda el punto cuando estés en la ubicación correcta.';
  }

  function handleNotification(event){receiveBluetooth(event.target.value);}

  function stopBluetoothPolling(){
    if(bluetoothPollTimer!==null){globalThis.clearInterval(bluetoothPollTimer);bluetoothPollTimer=null;}
  }

  async function refreshBluetoothReading(){
    if(!bluetoothCharacteristic||bluetoothReadPending||savingPoint||!draft)return;
    bluetoothReadPending=true;
    try{receiveBluetooth(await bluetoothCharacteristic.readValue());}
    catch(error){
      if(bluetoothDevice&&bluetoothDevice.gatt&&bluetoothDevice.gatt.connected)elements.bluetoothStatus.textContent='Conectado. Esperando la siguiente lectura del medidor…';
    }finally{bluetoothReadPending=false;}
  }

  function startBluetoothPolling(){
    stopBluetoothPolling();
    if(!bluetoothCharacteristic||!draft||savingPoint)return;
    refreshBluetoothReading();
    bluetoothPollTimer=globalThis.setInterval(refreshBluetoothReading,2000);
  }

  async function connectBluetooth(){
    if(!('bluetooth' in navigator))return;
    elements.connectButton.disabled=true;elements.bluetoothStatus.textContent='Selecciona YK-S01 en la ventana Bluetooth…';
    try{
      bluetoothDevice=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'YK-S01'}],optionalServices:[YINMIK_SERVICE]});
      bluetoothDevice.addEventListener('gattserverdisconnected',handleDisconnected);
      const server=await bluetoothDevice.gatt.connect();
      const service=await server.getPrimaryService(YINMIK_SERVICE);
      bluetoothCharacteristic=await service.getCharacteristic(YINMIK_MEASUREMENT);
      bluetoothCharacteristic.addEventListener('characteristicvaluechanged',handleNotification);
      await bluetoothCharacteristic.startNotifications();setConnected(true);elements.bluetoothStatus.textContent='Conectado. Esperando lectura del medidor…';
      startBluetoothPolling();
    }catch(error){
      if(bluetoothDevice&&bluetoothDevice.gatt&&bluetoothDevice.gatt.connected)bluetoothDevice.gatt.disconnect();
      setConnected(false);
      elements.bluetoothStatus.textContent=error&&error.name==='NotFoundError'?'No se seleccionó ningún medidor.':'No fue posible conectar. Verifica que el YK-S01 esté encendido y cerca.';
    }finally{elements.connectButton.disabled=false;}
  }

  function disconnectBluetooth(){
    stopBluetoothPolling();
    if(bluetoothCharacteristic)bluetoothCharacteristic.removeEventListener('characteristicvaluechanged',handleNotification);
    if(bluetoothDevice&&bluetoothDevice.gatt&&bluetoothDevice.gatt.connected)bluetoothDevice.gatt.disconnect();else handleDisconnected();
  }

  function initializeBluetooth(){
    setConnected(false);
    elements.bluetoothStatus.textContent='bluetooth' in navigator
      ?'Enciende el YK-S01 y pulsa conectar. En iPhone, abre esta página dentro de Bluefy.'
      :'Bluetooth no está disponible en este navegador. Puedes ingresar el pH manualmente.';
    elements.connectButton.disabled=!(('bluetooth') in navigator);
  }

  elements.farmSelect.addEventListener('change',populateLots);
  elements.lotSelect.addEventListener('change',updatePlan);
  elements.startButton.addEventListener('click',startJourney);
  elements.resumeButton.addEventListener('click',openCapture);
  elements.captureBack.addEventListener('click',()=>{renderResume();showScreen(0);});
  elements.resultBack.addEventListener('click',()=>showScreen(1));
  elements.manualButton.addEventListener('click',useManualReading);
  elements.manualPh.addEventListener('keydown',event=>{if(event.key==='Enter')useManualReading();});
  elements.savePointButton.addEventListener('click',savePoint);
  elements.finishButton.addEventListener('click',openResult);
  elements.saveJourneyButton.addEventListener('click',saveJourney);
  elements.connectButton.addEventListener('click',connectBluetooth);
  elements.disconnectButton.addEventListener('click',disconnectBluetooth);

  loadData();populateFarms();renderHistory();renderResume();initializeBluetooth();showScreen(0);
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').then(registration=>registration.update()).catch(()=>{}));
})();
