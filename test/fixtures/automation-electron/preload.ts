import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('probe',{
  on:(channel:string,listener:(value:unknown)=>void)=>{const wrapped=(_event:unknown,value:unknown)=>listener(value);ipcRenderer.on(channel,wrapped);return()=>ipcRenderer.removeListener(channel,wrapped)},
  automationFrameState:(value:unknown)=>ipcRenderer.invoke('automationFrameState',value),
  automationFrameResult:(id:string,value:unknown)=>ipcRenderer.invoke('automationFrameResult',id,value),
})
