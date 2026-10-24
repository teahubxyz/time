// A small dependency-free PNG renderer. The bitmap font keeps output identical
// in Workers and Node, without remote fonts or a browser in the request path.
const FONT = {
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['111','010','010','010','010','010','111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','11011','10001'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['010','110','010','010','010','010','111'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
 '%':['11001','11010','00010','00100','01000','01011','10011'],'.':['0','0','0','0','0','1','1'],'-':['000','000','000','111','000','000','000'],'/':['00001','00001','00010','00100','01000','10000','10000'],':':['0','1','1','0','1','1','0'],' ':['000','000','000','000','000','000','000']
};
const WIDTH = 1200, HEIGHT = 630;
const PALETTE = new Uint8Array([245,243,236,38,61,51,227,108,73,184,190,178,220,222,211,231,235,221]);
const encoder = new TextEncoder();
const table = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function u32(n){return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);}
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function chunk(name,data){const tag=encoder.encode(name);return concat([u32(data.length),tag,data,u32(crc(concat([tag,data])))]);}
function rawDeflate(data){
 const parts=[new Uint8Array([0x78,0x01])];
 for(let pos=0;pos<data.length;pos+=65535){const size=Math.min(65535,data.length-pos),last=pos+size===data.length;parts.push(new Uint8Array([last?1:0,size&255,size>>>8,(~size)&255,((~size)>>>8)&255]),data.subarray(pos,pos+size));}
 let a=1,b=0;for(const value of data){a=(a+value)%65521;b=(b+a)%65521;}parts.push(u32(((b<<16)|a)>>>0));return concat(parts);
}
export async function scorePNG(record = null){
 const pixels=new Uint8Array(WIDTH*HEIGHT);
 function rect(x,y,w,h,color){x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);for(let yy=Math.max(0,y);yy<Math.min(HEIGHT,y+h);yy++)pixels.fill(color,yy*WIDTH+Math.max(0,x),yy*WIDTH+Math.min(WIDTH,x+w));}
 function text(value,x,y,scale,color=1){for(const ch of String(value).toUpperCase()){const rows=FONT[ch]||FONT[' '];for(let yy=0;yy<7;yy++)for(let xx=0;xx<rows[yy].length;xx++)if(rows[yy][xx]==='1')rect(x+xx*scale,y+yy*scale,scale,scale,color);x+=(rows[0].length+1)*scale;}return x;}
 text('typy',76,66,7);rect(256,109,12,12,2);text('ONE WORD AT A TIME',78,144,3,3);rect(76,195,1048,2,4);
 const stats=record?.run?.stats;
 if(stats){
   text(Math.round(stats.wpm),76,240,24,1);text('WPM',600,333,7,2);
   text(`${stats.accuracy}% ACCURACY`,78,440,4,1);
   text(`${stats.bestStreak} WORD STREAK`,650,440,4,1);
   rect(76,504,1048,2,4);
   text('WATCH THE REPLAY. RACE MY GHOST.',78,551,4,2);
 }else{
   text('FIND YOUR',76,248,11,1);text('RHYTHM.',76,350,15,2);
   text('TYPE. REPLAY. RACE A FRIEND.',78,552,4,1);
 }
 const scanlines=new Uint8Array((WIDTH+1)*HEIGHT);for(let y=0;y<HEIGHT;y++)scanlines.set(pixels.subarray(y*WIDTH,(y+1)*WIDTH),y*(WIDTH+1)+1);
 let compressed;
 if(typeof CompressionStream==='function')compressed=new Uint8Array(await new Response(new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 else compressed=rawDeflate(scanlines);
 const header=concat([u32(WIDTH),u32(HEIGHT),new Uint8Array([8,3,0,0,0])]);
 return concat([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('PLTE',PALETTE),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}
