import { AutomationFrameSource } from '../../../src/renderer/lib/AutomationFrameSource'
const port=(window as any).probe
const canvas=document.querySelector('canvas')!
const frames=new AutomationFrameSource(port,()=>canvas)
let changed=false
port.on('simulatedInput',()=>{changed=true})
setInterval(()=>{
  const ctx=canvas.getContext('2d')!
  ctx.fillStyle=changed?'#2e8b57':'#b34b4b';ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle='#ffffff';ctx.font='14px sans-serif';ctx.fillText('SIMULATED DEVICE',10,30)
  ctx.fillText(changed?'Input received':'Waiting for input',10,60)
  frames.presented()
},40)
