import fs from 'node:fs'
export function openArchive(file, { indexEndsAtData = false } = {}) {
 const b=fs.readFileSync(file)
 if(b.toString('ascii',0,4)!=='Ls12') throw new Error('Expected Ls12')
 const records=[]
 const end=indexEndsAtData ? b.readUInt32BE(280) : b.length
 if(end<284 || end>b.length) throw new Error('Invalid Ls12 index boundary')
 for(let p=272;p+12<=end && b.readUInt32BE(p)!==0;p+=12) {
  const length=b.readUInt32BE(p), size=b.readUInt32BE(p+4), offset=b.readUInt32BE(p+8)
  if(size>50_000_000 || offset+length>b.length) throw new Error('Invalid index '+p)
  records.push({length,size,offset})
 }
 function read(index) {
  const {length,size,offset}=records[index]
  if(length===size)return b.subarray(offset,offset+length)
  const out=Buffer.alloc(size)
  let bit=offset*8, written=0
  function getBit() {
   if(bit >= (offset+length)*8) throw new Error('Truncated block '+index)
   const value=(b[bit>>3]>>(7-bit%8))&1
   bit++
   return value
  }
  function code() {
   let count=1
   while(getBit()) if(++count>23)throw new Error('Invalid code')
   let value=0
   for(let i=0;i<count;i++)value=value*2+getBit()
   return (2**count)-2+value
  }
  while(written<size) {
   const c=code()
   if(c<256)out[written++]=b[16+c]
   else {
    const distance=c-256, count=code()+3
    if(!distance||distance>written||written+count>size)throw new Error('Invalid reference in '+index)
    for(let i=0;i<count;i++){out[written]=out[written-distance];written++}
   }
  }
  return out
 }
 return {records,read}
}
