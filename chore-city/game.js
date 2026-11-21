'use strict';

const $ = id => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d');
const map = $('map').getContext('2d');
const missions = [
  { name:'Trash Dash', place:'Peach House', icon:'♻', color:'#79ecc0', x:4.3, z:-4, reward:25,
    steps:['Tie the bag before carrying it.', 'Put the bag in the trash bin and close the lid.'], lesson:'A closed bin keeps litter out of the street.' },
  { name:'Laundry Loop', area:'apartment', place:'Laundry nook', icon:'▤', color:'#94c9ff', x:-4.1, z:-4.3, reward:25,
    steps:['Sort the clean clothes into piles.', 'Fold the clothes and put them away.'], lesson:'Putting clothes away makes them easy to find.' },
  { name:'Water Works', place:'Community Garden', icon:'✿', color:'#ffd776', x:7, z:5, reward:30,
    steps:['Check the soil with your finger.', 'Water the dry soil around the roots.'], lesson:'Checking the soil first helps save water.' },
  { name:'Tidy Time', area:'apartment', place:'Living room', icon:'★', color:'#e7aafa', x:3.3, z:-3.1, reward:35,
    steps:['Gather the toys scattered on the floor.', 'Put the toys back in their basket.'], lesson:'Clear floors give everyone room to walk safely.' },
  { name:'Dish Duty', area:'apartment', place:'Kitchen sink', icon:'◈', color:'#85e5d7', x:0, z:-6, reward:30,
    steps:['Scrape food scraps into the compost bin.', 'Wash and rinse the dishes, then set them on the rack.'], lesson:'A clean sink and dishes are ready for the next meal.' },
  { name:'Desk Reset', area:'school', place:'Classroom', icon:'▤', color:'#8dc8ff', x:-3.4, z:-2.3, reward:30,
    steps:['Return pencils and notebooks to their places.', 'Wipe the desktop with a damp cloth.'], lesson:'A clear desk makes it easier for the next student to learn.' },
  { name:'Reading Corner', area:'school', place:'Bookshelf', icon:'★', color:'#ffcb86', x:3.6, z:-5.5, reward:30,
    steps:['Collect the books from the reading mat.', 'Stand the books upright on the shelf.'], lesson:'Returning books helps classmates find something to read.' }
];
const areas = {
  street:{label:'Sunset Bay', limitX:25, limitZ:25, spawn:{x:0,z:0}},
  apartment:{label:'Harbor Apartment', limitX:6.9, limitZ:7.5, spawn:{x:0,z:2.3}},
  school:{label:'Sunset Bay School', limitX:6.9, limitZ:7.5, spawn:{x:0,z:2.3}}
};
const doors = {
  apartment:{x:5,z:-5.65,label:'Harbor Apartment'},
  school:{x:-8,z:-5.65,label:'Sunset Bay School'}
};
const exitDoor = {x:0,z:3.7};
let area='street';
const missionArea = mission => mission.area || 'street';
const cart = {x:-2.3,z:2.1,facing:0};
const player = {x:0,z:0,walk:0};
const camera = {x:0,z:0,height:2.45,follow:4.8};
const nearClip = .32;
const touchControls = matchMedia('(pointer:coarse), (max-width:720px)');
const keys = new Set();
let active = 0;
let driving = false;
let message = '';
let messageUntil = 0;
let progress;
function readProgress(){
  try {
    const saved = JSON.parse(localStorage.getItem('chore-city-progress'));
    if (Array.isArray(saved)) return missions.map((mission,i) => Number.isInteger(saved[i]) && saved[i]>=0 && saved[i]<=mission.steps.length ? saved[i] : 0);
  } catch {}
  return missions.map(() => 0);
}
progress = readProgress();
const complete = i => progress[i] === missions[i].steps.length;
active = missions.findIndex((m,i) => missionArea(m)===area && !complete(i));

function renderMissions(){
  const board = $('missions');
  if (!board.children.length) missions.forEach((m,i) => {
    const button = document.createElement('button');
    button.className = 'mission';
    button.innerHTML = '<span class="mission-icon"></span><span><strong></strong><small></small></span><span class="reward"></span>';
    button.querySelector('.mission-icon').textContent = m.icon;
    button.querySelector('.mission-icon').style.color = m.color;
    button.querySelector('strong').textContent = m.name;
    button.addEventListener('click', () => { active = i; messageUntil = 0; renderMissions(); });
    board.append(button);
  });
  missions.forEach((m,i) => {
    const button = board.children[i];
    button.setAttribute('aria-pressed',i === active);
    button.querySelector('small').textContent = complete(i) ? 'Completed' : (missionArea(m)===area?m.place:areas[missionArea(m)].label);
    button.querySelector('.reward').textContent = complete(i) ? '✓' : '+' + m.reward;
  });
  $('count').textContent = progress.filter((_,i) => complete(i)).length + ' / ' + missions.length;
  $('points').textContent = missions.reduce((total,m,i) => total + (complete(i) ? m.reward : 0),0);
}
renderMissions();

const scenery = {street:[],apartment:[],school:[]};
const blockers = {street:[],apartment:[],school:[]};
function object(x,z,draw,zone='street'){scenery[zone].push({x,z,draw});}
function block(x,z,w,d,zone='street'){blockers[zone].push({x,z,w,d});}
let seed = 810;
function random(){seed = (Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}

let width, height, focal, originX, horizon, ratio;
let sky;
function resize(){
  const bounds = canvas.getBoundingClientRect();
  ratio = Math.min(Math.max(devicePixelRatio || 1,2),3);
  width = bounds.width;
  height = bounds.height;
  canvas.width = Math.round(width*ratio);
  canvas.height = Math.round(height*ratio);
  const mapCanvas=$('map');
  mapCanvas.width=152*ratio;
  mapCanvas.height=125*ratio;
  const compact = touchControls.matches && height<535;
  focal = Math.min(height*(compact?.69:.91),width*.92);
  originX = width*.5;
  horizon = height*(compact?.28:width<560?.43:.35);
  ctx.setTransform(ratio,0,0,ratio,0,0);
  sky = ctx.createLinearGradient(0,0,0,horizon+12);
  sky.addColorStop(0,'#7c9ebf');
  sky.addColorStop(.49,'#e2a6a3');
  sky.addColorStop(.8,'#ffbb91');
  sky.addColorStop(1,'#ffe0a4');
}
new ResizeObserver(resize).observe(canvas);
resize();
function depth(x,z){
  return camera.z-z+camera.follow;
}
function project(x,z,y,d){
  const across = x-camera.x;
  const zoom = focal/d;
  return [originX+across*zoom,horizon+(camera.height-y)*zoom,zoom];
}
function poly(points,fill){
  ctx.beginPath();
  let count=0;
  let previous=points[points.length-1];
  let previousDepth=depth(previous[0],previous[1]);
  const vertex=(x,z,y,d)=>{
    const [sx,sy]=project(x,z,y,d);
    if(count++)ctx.lineTo(sx,sy);
    else ctx.moveTo(sx,sy);
  };
  for(const point of points){
    const [x,z,y]=point;
    const d=depth(x,z);
    if((d>=nearClip)!==(previousDepth>=nearClip)){
      const t=(nearClip-previousDepth)/(d-previousDepth);
      vertex(previous[0]+(x-previous[0])*t,previous[1]+(z-previous[1])*t,previous[2]+(y-previous[2])*t,nearClip);
    }
    if(d>=nearClip)vertex(x,z,y,d);
    previous=point;
    previousDepth=d;
  }
  if(count<3)return;
  ctx.closePath();
  ctx.fillStyle=fill;
  ctx.fill();
}
function plane(x,z,w,d,fill,y=0){
  poly([[x-w/2,z-d/2,y],[x+w/2,z-d/2,y],[x+w/2,z+d/2,y],[x-w/2,z+d/2,y]],fill);
}
function box(x,z,w,d,h,colors,y=0){
  const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2,t=y+h;
  poly([[a,e,y],[b,e,y],[b,e,t],[a,e,t]],colors[1]);
  if(camera.x>b)poly([[b,c,y],[b,e,y],[b,e,t],[b,c,t]],colors[2]);
  if(camera.x<a)poly([[a,c,y],[a,e,y],[a,e,t],[a,c,t]],colors[2]);
  plane(x,z,w,d,colors[0],t);
}
function ellipse(x,z,y,rx,ry,fill){
  const d=depth(x,z);
  if(d<nearClip)return;
  const [a,b,scale]=project(x,z,y,d);
  ctx.beginPath();
  ctx.ellipse(a,b,rx*scale,ry*scale,0,0,Math.PI*2);
  ctx.fillStyle=fill;
  ctx.fill();
}

const palettes = [
  ['#ffe3ba','#f9ba88','#d98f6b','#f48578','#c75860'],
  ['#def3f5','#aadee7','#78b7c9','#5885ae','#405c87'],
  ['#f5f6d0','#d8eab6','#a6c78d','#63a995','#438977'],
  ['#fff1cf','#fce0a2','#d4a777','#bd92b3','#946f9e']
];
const houses = [
  [5,-8,0],[-7,7,1],[-8,-8,2],[11,-9,3],[-13,-8,0],[-13,8,3],
  [8,12,2],[14,7,1],[-8,14,0],[6,-15,1],[15,-16,2],[-9,-15,3],
  [-17,14,2],[15,14,0],[-17,-15,1],[20,-8,3]
];
function house(x,z,palette){
  const [top,front,side,roof,roofDark]=palettes[palette];
  block(x,z,4.6,3.6);
  object(x,z,() => {
    const h=2.75;
    box(x,z,4.5,3.5,h,[top,front,side]);
    box(x,z+1.89,1.43,.48,.2,['#e9e5d6','#bfb7a7','#aaa599']);
    box(x,z+1.76,.76,.055,1.45,['#fff2df','#f7f0dc','#d9cfb7'],.19);
    box(x,z+1.8,.6,.055,1.29,['#597887','#4d677c','#3a5669'],.21);
    box(x+.19,z+1.84,.065,.035,.07,['#fff0b0','#ffd884','#e2ad5c'],.74);
    for(const dx of [-1.48,1.48]){
      box(x+dx,z+1.76,.92,.06,.83,['#fffbdf','#fffae9','#d5c7ad'],1.11);
      box(x+dx,z+1.81,.71,.04,.63,['#c7edee','#6693a7','#496b80'],1.2);
      box(x+dx,z+1.84,.06,.025,.63,['#f5f5df','#f5f5df','#d5c7ad'],1.2);
      box(x+dx,z+1.84,.71,.025,.065,['#f5f5df','#f5f5df','#d5c7ad'],1.48);
      box(x+dx,z+1.89,.86,.22,.12,['#aade83','#a96d55','#8e594c'],1.02);
      for(let j=0;j<4;j++) ellipse(x+dx-.3+j*.2,z+1.91,1.17,.085,.06,j%2?'#ffb1ad':'#ffdd78');
    }
    for(const dz of [-.85,.75]){
      box(x+2.26,z+dz,.065,.82,.83,['#fffbdf','#fffae9','#e8dcc4'],1.11);
      box(x+2.31,z+dz,.035,.63,.63,['#b2d5df','#64889c','#54788c'],1.2);
      box(x+2.34,z+dz,.03,.062,.63,['#f5f5df','#f5f5df','#ded2b9'],1.2);
    }
    const l=x-2.53,r=x+2.53,f=z+2,b=z-2;
    if(camera.x>r)poly([[r,b,h],[r,f,h],[r,z,h+1.42]],roofDark);
    if(camera.x<l)poly([[l,b,h],[l,f,h],[l,z,h+1.42]],roofDark);
    poly([[l,f,h],[r,f,h],[r,z,h+1.42],[l,z,h+1.42]],roof);
    for(let j=1;j<14;j++){
      const xx=l+j*(r-l)/14;
      poly([[xx,f,h],[xx+.018,f,h],[xx+.018,z,h+1.42],[xx,z,h+1.42]],roofDark+'45');
    }
    for(let j=1;j<6;j++){
      const q=j/6;
      poly([[l,z+2*q,h+1.42*(1-q)],[r,z+2*q,h+1.42*(1-q)],[r,z+2*q+.023,h+1.42*(1-q)-.015],[l,z+2*q+.023,h+1.42*(1-q)-.015]],roofDark+'65');
    }
    box(x+1.19,z+.56,.43,.44,.65,['#e9d8bf','#dabea8','#a78b80'],h+1.01);
  });
}
houses.forEach(args => house(...args));

function tree(x,z,s,palm=false){
  object(x,z,() => {
    if(palm){
      box(x,z,.17*s,.17*s,2.7*s,['#cba274','#ac805c','#896751']);
      for(let j=0;j<7;j++){
        const a=j*Math.PI*2/7, dx=Math.cos(a)*s,dz=Math.sin(a)*s;
        poly([[x,z,2.7*s],[x+dx*.64-dz*.27,z+dz*.64+dx*.27,2.98*s],[x+dx*1.34,z+dz*1.34,2.56*s],[x+dx*.62+dz*.22,z+dz*.62-dx*.22,2.7*s]],j%2?'#509966':'#74bd70');
      }
      return;
    }
    box(x,z,.25*s,.25*s,1.66*s,['#cba274','#a67a55','#8f634b']);
    const shades = [['#a7da7a','#78b76d','#57965f'],['#b5e18b','#91c879','#66a46a'],['#89cd80','#65af70','#509364']];
    for(const [dx,dz,y,k] of [[-.38,-.15,1.67,0],[.44,.02,1.63,2],[0,.38,1.48,2],[0,-.05,2.14,1]]){
      const xx=x+dx*s,zz=z+dz*s,yy=y*s,rr=.79*s;
      const a=[xx-rr,zz,yy],b=[xx,zz+rr,yy],c=[xx+rr,zz,yy],d=[xx,zz-rr,yy];
      const t=[xx,zz,yy+.84*s],bottom=[xx,zz,yy-.55*s];
      poly([a,b,bottom],shades[k][2]);poly([b,c,bottom],shades[k][2]);
      poly([a,b,t],shades[k][0]);poly([b,c,t],shades[k][1]);poly([c,d,t],shades[k][2]);
    }
  });
}
const trees = [[3,-5,1.1],[8,-5,.85],[1.8,-7,1.12],[-3.7,-7,1.1],[-5,-5,.8],
  [-10,-5,1.15],[-5.3,5,.95],[-9,4,1.1],[-4,8,1.1],[3.8,8,1.12],[9,4,1.05],[11,5,1.25],[14,4,.8],
  [4,4,.84],[11,-5,1.1],[13,-5,.8],[-13,-5,1],[-15,4,1.05],[4,-11,.9],[-4,-11,1.1],
  [11,10,1.1],[5,15,1.2],[-4,13,.92],[-12,12,1.2],[18,4,1.15],[19,10,1]];
trees.forEach(([x,z,s],i)=>tree(x,z,s,i%4===2));
for(let i=0;i<39;i++){
  const x=random()*48-24,z=random()*48-24;
  if(Math.abs(x)<4 || Math.abs(z)<4 || houses.some(([a,b])=>Math.abs(x-a)<3 && Math.abs(z-b)<2.4)) continue;
  tree(x,z,.65+random()*.65,i%3===0);
}

object(4.3,-4,() => {
  const x=4.3,z=-4;
  box(x,z,.58,.49,.68,['#7dc29c','#559880','#3a746b']);
  box(x,z,.65,.56,.13,['#9de5b1','#65ae90','#478a79'],.67);
  if(!complete(0)){
    ellipse(x+.56,z+.21,.17,.19,.17,'#394756');
    if(progress[0]) ellipse(x+.56,z+.21,.36,.075,.048,'#394756');
  }
});
object(7,5,() => {
  box(7,5,.42,.26,.32,['#a6dbee','#6eb4c7','#548eab']);
  box(7.25,5,.25,.09,.09,['#b8ebf2','#8ac9d7','#6cb1c4'],.19);
});
for(const z of [6.1,7.1,8.1]){
  object(7,z,() => {
    box(7,z,3.05,.76,.22,[complete(2)?'#6f5144':'#926854','#bb8b65','#93664f']);
    for(let j=0;j<8;j++){
      const x=5.74+j*.36;
      ellipse(x,z,.34,.15,.11,j%2?'#a8d772':'#69b268');
      ellipse(x,z,.42,.06,.05,j%3?'#ffbb75':'#ff95a2');
    }
  });
}
for(let i=-4;i<=4;i++){
  const x=i*5;
  tree(x,-26,1.35,true);
  object(x,-29,()=>{
    box(x,-29,.15,.15,.85,['#fff1cf','#d6c2a4','#ad9074']);
    box(x+2.4,-29,4.85,.11,.10,['#fff1cf','#d6c2a4','#ad9074'],.67);
  });
}
for(const [x,z] of [[3.35,-3.4],[-3.45,-3.45],[-3.45,3.45],[3.45,3.45],[10,-3.4],[-10.5,3.4]]){
  object(x,z,() => {
    box(x,z,.19,.19,2.23,['#b9cacf','#617f8a','#526a7a']);
    box(x+.15,z,.52,.28,.16,['#dce5db','#fff0b3','#b4c4bd'],2.22);
  });
}
const grass = [];
for(let i=0;i<510;i++){
  const x=random()*72-36,z=random()*72-36;
  if(z>-29 && Math.abs(x)>3.5 && Math.abs(z)>3.5) grass.push([x,z,.08+random()*.19,i%5]);
}
function drawSky(){
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,width,height);
  const sunX=width*.78,sunY=horizon*.69;
  const sunRadius=Math.max(18,Math.min(width,height)*.044);
  const glow=ctx.createRadialGradient(sunX,sunY,sunRadius*.4,sunX,sunY,sunRadius*3.6);
  glow.addColorStop(0,'#fff0c6b0');
  glow.addColorStop(1,'#ffe5af00');
  ctx.fillStyle=glow;
  ctx.fillRect(sunX-sunRadius*4,sunY-sunRadius*4,sunRadius*8,sunRadius*8);
  ctx.beginPath();
  ctx.arc(sunX,sunY,sunRadius,0,Math.PI*2);
  ctx.fillStyle='#fff0c5';
  ctx.fill();
  for(const [position,elevation,w,h] of [[.15,.26,.14,4],[.27,.63,.18,5],[.66,.34,.16,4],[.86,.78,.17,3]]){
    ctx.beginPath();
    ctx.ellipse(width*position,horizon*elevation,Math.max(12,width*w),h,0,0,Math.PI*2);
    ctx.fillStyle='#ffe0cd72';
    ctx.fill();
  }
  for(let i=0;i<30;i++){
    const x=width*((i*31)%109)/109;
    const h=3+(i*17)%23;
    ctx.fillStyle=i%3===0?'#b2868f':'#ba9296';
    ctx.fillRect(x,horizon-h,Math.max(3,width*.008),h+4);
  }
}

function ground(){
  plane(0,-77,240,90,'#648b9c');
  plane(0,-31.6,200,6.4,'#e8bc8d');
  plane(0,36,200,131,'#879f66');
  const bayColors=['#7da1a7','#a8b6ae','#d0b6a1'];
  for(let i=0;i<26;i++){
    const z=-35-(i%7)*3.3;
    plane((i*13)%69-34,z,2.5+(i%4)*1.2,.11,bayColors[i%3]);
  }
  for(let x=-36;x<36;x+=6) for(let z=-36;z<36;z+=6)
    if(z>=-30 && (x+z)%12===0) plane(x+3,z+3,6,6,'#8ebd7c');
  grass.forEach(([x,z,r,i])=>depth(x,z)>.2 && plane(x,z,r,r*.52,['#9ac684','#74ab70','#a4ca8d','#b2cf8c','#80b171'][i]));
  for(const [x,z] of houses){
    plane(x+.63,z+.7,5.35,4.3,'#50453b33');
    plane(x,z,5.55,4.2,'#9cca83');
    plane(x,z,4.9,3.85,'#80aa71');
    const end=z<0?-3.36:z+3.3;
    const start=z+1.65;
    if(Math.abs(z)<10) plane(x,(start+end)/2,1.13,Math.abs(end-start),'#e7daca');
  }
  for(const [x,z,s] of trees) plane(x+.71,z+.78,s*1.3,s*1.8,'#413e3d2b');
  const sidewalk='#dbc5aa', asphalt='#696b72';
  plane(0,10,6.8,78,sidewalk);plane(0,0,110,6.8,sidewalk);
  plane(0,10,5.56,78,asphalt);plane(0,0,110,5.56,asphalt);
  for(const side of [-1,1]){
    plane(side*2.69,10,.034,78,'#b7a995');
    plane(0,side*2.69,110,.034,'#b7a995');
  }
  for(let i=-43;i<=43;i+=2.2){
    if(Math.abs(i)>3.8){
      plane(i,0,.98,.075,'#e9c67d');if(i>-29)plane(0,i,.075,.98,'#e9c67d');
    }
  }
  for(let i=0;i<36;i++){
    const n=i-18;
    const offset=1.84+Math.sin(i*6.2)*.33;
    plane(offset,n*1.34,.016,.38,'#b4b1ab49');
    plane(n*1.34,-offset,.38,.016,'#a9a7a34a');
  }
  for(let j=-2;j<=2;j++){
    plane(j*.87,2.15,.45,.66,'#ecebe5');plane(j*.87,-2.15,.45,.66,'#ecebe5');
  }
  plane(7,7.12,3.85,3.4,'#b3c795');
  for(let i=0;i<13;i++){
    const x=3.9+i*.56;
    ellipse(x,-3.66,0,.085,.06,i%2?'#fff0a0':'#f8a6a9');
  }
}

function drawInterior(){
  const apartment=area==='apartment';
  ctx.fillStyle=apartment?'#6f514c':'#4a6874';
  ctx.fillRect(0,0,width,height);
  plane(0,-1.6,14,12.8,apartment?'#ad7859':'#a6acaa');
  if(apartment){
    for(let x=-6.75;x<7;x+=.5){
      const shade=Math.round(158+(Math.sin(x*41)+1)*12);
      plane(x,-1.6,.479,12.8,'rgb('+shade+' 118 87)');
      for(let z=-7+(Math.abs(x)%1)*2;z<4;z+=2.2)plane(x,z,.48,.016,'#785944');
    }
    plane(3,-3.25,5.6,4.1,'#724d66');
    plane(3,-3.25,5.42,3.9,'#be8191');
    plane(-3.4,-3,3.75,2.3,'#a96851');
    plane(-3.4,-3,3.53,2.11,'#e6be8a');
  } else {
    for(let x=-6.5;x<7;x++)for(let z=-7.5;z<5;z++){
      plane(x,z,.978,.98,(x+z)%2===0?'#cbd5d5':'#bbc8c9');
    }
    plane(3.85,-4.55,4.8,4,'#4e7189');
    plane(3.85,-4.55,4.57,3.77,'#83a5b8');
    for(let z=-5.9;z<-2.8;z+=.35)plane(3.85,z,4.2,.028,'#a7c1c9');
  }
  plane(0,-1.6,14.16,12.8,apartment?'#d9baa5':'#c4d2d2',3.9);
  for(const x of [-4,0,4]){
    plane(x,-2.1,apartment?1.05:1.8,.7,apartment?'#dfc1a5':'#b3c1c5',3.89);
    plane(x,-2.1,apartment?.83:1.61,.49,apartment?'#ffe7c1':'#f7fcf5',3.88);
  }
  box(0,-8.07,14.27,.14,3.9,apartment?['#f5d5bb','#e8c4a9','#b48776']:['#e4edf1','#d9e9ed','#a6bac6']);
  box(0,-7.96,14,.045,.17,['#eee7d9','#f6eee1','#bca797']);
  for(const x of [-7.04,7.04]){
    const facing=apartment?'#c29b88':'#9ab2be';
    box(x,-4.8,.14,6.4,3.9,[facing,facing,facing]);
  }
  for(const x of apartment?[-4.6,4.65]:[-4.65,.15,4.9]){
    box(x,-7.955,2.83,.06,1.8,['#faf5e9','#fff8e7','#ddd0bb'],1.48);
    box(x,-7.911,2.56,.04,1.53,['#b4dce3','#9bcdd9','#82a4bc'],1.61);
    box(x,-7.874,2.55,.026,.45,['#fbcba1','#f5caa7','#daa885'],1.61);
    box(x,-7.85,.046,.045,1.56,['#fffae8','#fffae8','#e7d7be'],1.6);
    box(x,-7.85,2.58,.051,.044,['#fffae8','#fffae8','#e7d7be'],2.31);
    box(x,-7.84,2.8,.19,.085,['#fff7e8','#f4e0cc','#cbac95'],1.46);
  }
  if(!apartment){
    const frame=['#e5c190','#c69b70','#987752'];
    box(-.05,-7.82,2.23,.09,1.34,frame,1.23);
    box(-.05,-7.758,2.07,.036,1.18,['#65958d','#3f6c65','#365852'],1.31);
    for(let j=0;j<4;j++)box(-.3+(j%2)*.17,-7.73,1.03-(j%2)*.33,.018,.024,['#b8cbbc','#c1d0c0','#a0b8a8'],1.63+j*.15);
  }
  plane(0,3.72,2.2,.73,'#88775d');
  plane(0,3.72,1.93,.57,'#c6ad83');
}

const wood=['#dba276','#b97958','#a1664d'];
const shade=['#e6c1a1','#a97b68','#94604e'];
const metal=['#edeee6','#d8dedb','#a6b5b7'];
function furniture(zone,x,z,w,d,draw){
  object(x,z,draw,zone);
  block(x,z,w,d,zone);
}
furniture('apartment',0,-7.22,5.3,1.03,()=>{
  box(0,-7.22,5.3,1.02,.91,['#c79266','#b87f57','#91674e']);
  for(let x=-2;x<=2;x++){
    box(x,-6.689,.93,.048,.73,shade,.08);
    box(x,-6.65,.16,.07,.044,metal,.63);
  }
  box(0,-7.22,5.44,1.12,.12,['#f4e3cf','#decec1','#bfaaa0'],.91);
  box(0,-7.19,1.03,.66,.036,['#6a8790','#9cabb0','#84979f'],1.04);
  box(-.03,-7.54,.076,.074,.34,metal,1.07);
  box(-.03,-7.43,.076,.24,.07,metal,1.34);
  if(!complete(4)){
    for(let i=0;i<3;i++)ellipse(.69+i*.17,-7.12,1.04+i*.034,.15,.031,progress[4]?'#f5ece1':'#bcd9d3');
  }
});
furniture('apartment',-4.25,-5.74,2,1.15,()=>{
  for(const x of [-4.79,-3.72]){
    box(x,-5.74,.99,1.05,1.15,metal);
    ellipse(x,-5.201,.58,.34,.34,'#7e98a3');
    ellipse(x,-5.185,.58,.25,.25,'#40566b');
    ellipse(x-.052,-5.167,.64,.12,.08,'#647f8c');
    box(x,-5.188,.58,.05,.12,['#edf1e8','#eaf0eb','#b7c7c7'],.95);
  }
  for(let i=0;i<3 && !complete(1);i++){
    const color=['#d08fa0','#97b8c9','#f0c58e'][i];
    box(-4.52+i*.22,-5.7,.24,progress[1]?.36:.54,.07,[color,color,'#c78691'],1.17);
  }
});
furniture('apartment',4.85,-4.14,2.85,1.65,()=>{
  const upholstery=['#e29392','#b9737a','#975969'];
  box(4.85,-4.14,2.85,1.62,.43,upholstery);
  box(4.85,-4.72,2.84,.41,.86,upholstery,.42);
  for(const x of [3.57,6.13])box(x,-4.1,.23,1.44,.38,upholstery,.42);
  for(let i=0;i<3;i++){
    box(4.01+i*.84,-3.96,.79,.89,.18,['#f1a8a0','#d58987','#b56f79'],.45);
    box(4.32+i*.7,-4.53,.36,.19,.35,['#f4cf8e','#eeb780','#b87f68'],.66);
  }
});
object(3.22,-3.03,()=>{
  box(3.24,-3.04,.49,.41,.33,wood);
  if(!complete(3))for(let i=0;i<4;i++){
    const x=3.22+(i-1.5)*(progress[3]?.085:.24), z=-2.63+(i%2)*.22;
    const color=['#f0c273','#cc8194','#8d9fc5','#94c3a0'][i];
    box(x,z,.145,.15,.14,[color,color,'#8d8ca6']);
  }
},'apartment');
for(const z of [-4.7,-2.9])for(const x of [-4.4,-1.9]){
  furniture('school',x,z,1.36,.86,()=>{
    for(const dx of [-.55,.55])for(const dz of [-.28,.28])box(x+dx,z+dz,.075,.075,.71,metal);
    box(x,z,1.36,.86,.095,wood,.69);
    if(!complete(5)){
      box(x-.24,z-.17,.44,.32,.06,['#edf0cf','#d6d7b3','#b3b299'],.79);
      box(x+.23,z+.07,.08,.32,.055,['#ffcd77','#dfac64','#ae815c'],.79);
    }
  });
}
furniture('school',3.95,-6.9,4.1,.65,()=>{
  box(3.95,-7.12,4.1,.16,2.25,wood);
  for(const y of [.15,.73,1.31,1.9]){
    box(3.95,-6.9,4.19,.65,.085,wood,y);
    for(let i=0;i<17;i++){
      if(i%5===2 || (!complete(6) && y===.73 && i<5))continue;
      const color=['#7395ba','#e89b91','#ecc673','#88afa5'][i%4];
      box(2.17+i*.22,-6.86,.15,.38,.31+(i%3)*.04,[color,color,'#6c7b89'],y+.09);
    }
  }
});
object(3.65,-5.18,()=>{
  if(complete(6))return;
  for(let i=0;i<3;i++){
    const color=['#c58387','#e2b663','#6b9eaa'][i];
    box(3.65+(i-1)*(progress[6]?.08:.37),-5.18+(progress[6]?0:i*.16),.27,.34,.06,[color,'#d9d1c0','#8c7772'],progress[6]?i*.07:0);
  }
},'school');
for(const [zone,x,z] of [['apartment',6.12,-6.45],['school',-5.94,-6.3]]){
  object(x,z,()=>{
    box(x,z,.48,.48,.43,['#ecd3ab','#bc8b73','#a27061']);
    for(const dx of [-.29,-.12,.12,.29]){
      poly([[x,z,.43],[x+dx-.15,z,1.01],[x+dx,z,1.34],[x+dx+.16,z,1.08]],dx<0?'#83ae74':'#6e986b');
    }
  },zone);
}

function drawCart(){
  const {x,z,facing}=cart;
  const across = Math.abs(Math.sin(facing))>Math.abs(Math.cos(facing));
  const w=across?.83:1.35,d=across?1.35:.83;
  ellipse(x,z,0,.73,.28,'#263d4655');
  for(const a of [-1,1]) for(const b of [-1,1])
    box(x+a*w*.42,z+b*d*.46,.22,.21,.24,['#4f5963','#313c49','#253343']);
  box(x,z,w,d,.38,['#ffd176','#e7a049','#c67747'],.14);
  box(x,z,w*.55,d*.56,.24,['#d6e7df','#659795','#4d827f'],.52);
  box(x,z,w*.72,d*.74,.09,['#ffe3a3','#efb958','#d89548'],.76);
}
function shadedOval(x,z,y,rx,ry,colors){
  const d=depth(x,z);
  if(d<nearClip)return;
  const [sx,sy,zoom]=project(x,z,y,d);
  const gradient=ctx.createLinearGradient(sx-rx*zoom,sy-ry*zoom,sx+rx*zoom,sy+ry*zoom);
  gradient.addColorStop(0,colors[0]);
  gradient.addColorStop(.55,colors[1]);
  gradient.addColorStop(1,colors[2]);
  ellipse(x,z,y,rx,ry,gradient);
}
function drawPlayer(){
  const {x,z,walk}=player;
  const stride=Math.sin(walk)*.11;
  const bob=Math.abs(Math.sin(walk))*.025;
  const skin=['#ffcf9f','#de9e76','#a66859'];
  const jacket=['#a8e9d0','#509f89','#266b63'];
  const pants=['#7d99bb','#546d91','#354758'];
  const shoes=['#fff4d6','#d9d9ca','#a89e92'];
  ellipse(x+.15,z+.09,0,.44,.15,'#293d504f');
  for(const side of [-1,1]){
    const xx=x+.13*side,zz=z+stride*side;
    shadedOval(xx,zz,.23,.091,.195,pants);
    shadedOval(xx,zz+.028,.062,.109,.068,shoes);
  }
  for(const side of [-1,1]){
    const zz=z-stride*side;
    shadedOval(x+.235*side,zz,.527+bob,.087,.19,jacket);
    shadedOval(x+.246*side,zz,.377+bob,.063,.077,skin);
  }
  shadedOval(x,z,.56+bob,.238,.235,jacket);
  shadedOval(x,z+.143,.55+bob,.175,.174,['#f8d390','#ce8d5a','#a9694d']);
  shadedOval(x,z+.166,.49+bob,.126,.061,['#f6d195','#e8af71','#b57b59']);
  shadedOval(x,z,.891+bob,.181,.165,skin);
  shadedOval(x,z+.021,.952+bob,.184,.132,['#906957','#624032','#382e2e']);
  shadedOval(x,z,.996+bob,.209,.105,['#d4a8ee','#a278c3','#674e8e']);
  shadedOval(x,z+.053,.948+bob,.219,.035,['#c7a2e7','#9b78c2','#6f5395']);
}
function marker(x,z,color,symbol,t){
  const d=depth(x,z);
  if(d<nearClip)return;
  const [a,b]=project(x,z,1.47+Math.sin(t*.004)*.095,d);
  if(a<15 || a>width-15 || b<12 || b>height-14)return;
  ctx.beginPath();
  ctx.moveTo(a,b+17);
  ctx.lineTo(a-6,b+8);
  ctx.lineTo(a+6,b+8);
  ctx.closePath();
  ctx.fillStyle=color;ctx.fill();
  ctx.beginPath();ctx.arc(a,b,13,0,Math.PI*2);
  ctx.fill();ctx.strokeStyle='#ffffffbb';ctx.lineWidth=1.5;ctx.stroke();
  ctx.fillStyle='#20364a';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(symbol,a,b+.5);
}
function minimap(){
  const w=152,h=125,s=area==='street'?2.28:6.5;
  map.setTransform(ratio,0,0,ratio,0,0);
  const dot=(x,z,r,color) => {
    map.beginPath();map.arc(w/2+x*s,h/2+z*s,r,0,Math.PI*2);map.fillStyle=color;map.fill();
  };
  map.fillStyle=area==='street'?'#527e63':'#534951';
  map.fillRect(0,0,w,h);
  if(area==='street'){
    map.fillStyle='#9ba3a2';
    map.fillRect(0,h/2-7,w,14);
    map.fillRect(w/2-7,0,14,h);
    houses.forEach(([x,z,p]) => {
      map.fillStyle=palettes[p][3];
      map.fillRect(w/2+(x-2.25)*s,h/2+(z-1.75)*s,4.5*s,3.5*s);
    });
    if(!driving)dot(cart.x,cart.z,2.5,'#ffcc7d');
    for(const door of Object.values(doors))dot(door.x,door.z,3,'#cbd9ff');
  } else {
    map.fillStyle='#9b8575';
    map.fillRect(w/2-7*s,h/2-8*s,14*s,14*s);
    map.fillStyle='#635862';
    blockers[area].forEach(({x,z,w:fw,d})=>map.fillRect(w/2+(x-fw/2)*s,h/2+(z-d/2)*s,fw*s,d*s));
    dot(exitDoor.x,exitDoor.z,3,'#cbd9ff');
  }
  missions.forEach((m,i)=>{
    if(missionArea(m)===area)dot(m.x,m.z,i===active?4:2.8,complete(i)?'#acc2b1':m.color);
  });
  dot(player.x,player.z,5,'#24354a');
  dot(player.x,player.z,3.2,'#fff5dd');
  const edgeX=w/2+player.x*s,edgeZ=h/2+player.z*s;
  map.beginPath();
  map.moveTo(edgeX,edgeZ);
  map.lineTo(edgeX,edgeZ-8);
  map.strokeStyle='#fff5dd';
  map.lineWidth=1.5;
  map.stroke();
}
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
function nearbyMission(){
  const reachable=(m,i)=>missionArea(m)===area && !complete(i) && distance(player,m)<1.35;
  if(active>=0 && reachable(missions[active],active)) return active;
  return missions.findIndex(reachable);
}
function nearbyDoor(){
  if(area!=='street')return distance(player,exitDoor)<1.35?'street':null;
  return Object.keys(doors).find(zone=>distance(player,doors[zone])<1.35);
}
function enterArea(next, viaDoor=false){
  if(next===area || !areas[next] || $('pauseMenu').open)return;
  const from=area;
  area=next;
  driving=false;
  keys.clear();
  messageUntil=0;
  Object.assign(player,next==='street' && viaDoor ? doors[from] : areas[next].spawn,{walk:0});
  Object.assign(camera,{x:player.x,z:player.z});
  const selected=missions[active];
  if(!selected || missionArea(selected)!==area || complete(active)){
    active=missions.findIndex((m,i)=>missionArea(m)===area && !complete(i));
  }
  $('areaName').textContent=areas[area].label;
  $('areaMapLabel').textContent=area==='street'?'N ↑':'↑';
  document.querySelectorAll('[data-area]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.area===area));
  renderMissions();
}
document.querySelectorAll('[data-area]').forEach(button=>button.addEventListener('click',()=>enterArea(button.dataset.area)));

function interact(){
  if($('pauseMenu').open) return;
  const i=nearbyMission();
  if(i>=0 && !driving){
    progress[i]++;
    try {localStorage.setItem('chore-city-progress',JSON.stringify(progress));} catch {}
    active=i;
    if(complete(i)){
      message='✓ '+missions[i].lesson+'  +'+missions[i].reward+' points';
      messageUntil=performance.now()+6000;
      active=missions.findIndex((m,index) => missionArea(m)===area && !complete(index));
    }
    renderMissions();
    return;
  }
  if(driving){
    driving=false;
    const adjacent=[{x:cart.x+.9,z:cart.z},{x:cart.x-.9,z:cart.z},{x:cart.x,z:cart.z+.9},{x:cart.x,z:cart.z-.9}];
    const exit=adjacent.find(({x,z})=>passable(x,z));
    if(exit) Object.assign(player,exit);
  } else if(nearbyDoor()){
    enterArea(nearbyDoor(),true);
  } else if(area==='street' && distance(player,cart)<1.65){
    driving=true;
    player.x=cart.x;
    player.z=cart.z;
  }
}
function updateObjective(time){
  const near=nearbyMission();
  const m=missions[active];
  const door=nearbyDoor();
  const touch=touchControls.matches;
  const action=touch?'Interact':'E';
  let label;
  if(driving) label='<b>Driving the neighborhood cart</b> · '+action+' to get out';
  else if(near>=0) label='<b>'+missions[near].name+'</b> · '+missions[near].steps[progress[near]]+' <b>['+action+']</b>';
  else if(time<messageUntil) label='<b>'+message+'</b>';
  else if(door) label='<b>'+action+'</b> · '+(door==='street'?'Return to street':'Enter '+doors[door].label);
  else if(area==='street' && distance(player,cart)<1.65) label='<b>Neighborhood cart</b> · '+action+' to drive';
  else if(m && !complete(active)){
    if(missionArea(m)!==area){
      label='<b>'+m.name+'</b> · Open '+areas[missionArea(m)].label+' above';
      if($('objective').innerHTML!==label)$('objective').innerHTML=label;
      return;
    }
    const x=m.x-player.x,z=m.z-player.z;
    const east=x;
    const forward=-z;
    const directions=['forward','forward and right','right','back and right','back','back and left','left','forward and left'];
    const direction=(Math.round(Math.atan2(east,forward)*4/Math.PI)+8)%8;
    const arrow='<span class="direction" role="img" aria-label="'+directions[direction]+'" style="--turn:'+direction*45+'deg">↑</span>';
    label='<b>'+arrow+' '+m.name+'</b> · '+m.place+' · '+Math.round(distance(player,m))+' m';
  }
  else if(m) label='<b>'+m.name+' complete</b> · '+m.lesson;
  else label='<b>Chores here complete!</b> · Explore another area or keep looking around.';
  if($('objective').innerHTML!==label) $('objective').innerHTML=label;
}
function passable(x,z){
  const {limitX,limitZ}=areas[area];
  if(area!=='street' && z>4.15)return false;
  return Math.abs(x)<=limitX && Math.abs(z)<=limitZ &&
    !blockers[area].some(b=>Math.abs(x-b.x)<b.w/2+.19 && Math.abs(z-b.z)<b.d/2+.19);
}
function move(dt){
  const dx=Number(keys.has('ArrowRight') || keys.has('d'))-Number(keys.has('ArrowLeft') || keys.has('a'));
  const dy=Number(keys.has('ArrowDown') || keys.has('s'))-Number(keys.has('ArrowUp') || keys.has('w'));
  if(!dx && !dy){player.walk=0;return;}
  const length=Math.hypot(dx,dy);
  const speed=driving?6.6:area==='street'?4.25:3.25;
  const x=player.x+dx/length*dt*speed,z=player.z+dy/length*dt*speed;
  if(passable(x,player.z)) player.x=x;
  if(passable(player.x,z)) player.z=z;
  player.walk+=dt*13;
  if(driving) Object.assign(cart,{x:player.x,z:player.z,facing:Math.atan2(dy,dx)});
}
function togglePause(){
  if($('pauseMenu').open) $('pauseMenu').close();
  else {keys.clear();$('pauseMenu').showModal();}
}
$('pause').addEventListener('click',togglePause);
$('resume').addEventListener('click',togglePause);
$('touchInteract').addEventListener('click',interact);
const movementKeys=['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
window.addEventListener('keydown',event=>{
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  if(movementKeys.includes(key) && !$('pauseMenu').open){
    event.preventDefault();keys.add(key);
  }
  if(key==='e' && !event.repeat) interact();
  if(key==='Escape' && !event.repeat){event.preventDefault();togglePause();}
});
window.addEventListener('keyup',event=>keys.delete(event.key.length===1?event.key.toLowerCase():event.key));
window.addEventListener('blur',()=>keys.clear());
document.querySelectorAll('[data-move]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{
    button.setPointerCapture(event.pointerId);
    keys.add(button.dataset.move);
  });
  button.addEventListener('lostpointercapture',()=>keys.delete(button.dataset.move));
  button.addEventListener('pointerup',()=>keys.delete(button.dataset.move));
  button.addEventListener('pointercancel',()=>keys.delete(button.dataset.move));
});
let last=performance.now();
function frame(now){
  const dt=Math.min((now-last)/1000,.05);
  last=now;
  const paused=$('pauseMenu').open;
  if(!paused)move(dt);
  const follow=1-Math.exp(-dt*5.5);
  camera.x+=(player.x-camera.x)*follow;
  camera.z+=(player.z-camera.z)*follow;
  camera.follow+=((driving?3.85:4.8)-camera.follow)*follow;
  camera.height+=((driving?1.95:2.45)-camera.height)*follow;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  if(area==='street'){
    drawSky();
    ground();
  } else drawInterior();
  const visible=[...scenery[area]];
  if(area==='street')visible.push({x:cart.x,z:cart.z,draw:drawCart});
  if(!driving) visible.push({x:player.x,z:player.z,draw:drawPlayer});
  visible.sort((a,b)=>depth(b.x,b.z)-depth(a.x,a.z));
  for(const item of visible){
    const d=depth(item.x,item.z);
    if(d<=-3)continue;
    const [x,y,zoom]=project(item.x,item.z,0,Math.max(nearClip,d));
    if(x>-zoom*4 && x<width+zoom*4 && y<height+zoom*4)item.draw();
  }
  missions.forEach((m,i)=>{
    if(missionArea(m)===area && !complete(i))marker(m.x,m.z,i===active?'#9af4c7':m.color,m.icon,now);
  });
  if(area==='street'){
    for(const door of Object.values(doors))marker(door.x,door.z,'#cbd9ff','↥',now);
    if(!driving && distance(player,cart)<2.9)marker(cart.x,cart.z,'#ffd776','◆',now);
  } else if(distance(player,exitDoor)<1.35)marker(exitDoor.x,exitDoor.z,'#cbd9ff','↩',now);
  minimap();
  updateObjective(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
