// Shared GUI/automation serializer. Device attribute text is XML data, never
// markup. Limit generated output as well as depth before publishing an artifact.
export function toHierarchyXml(value: unknown) {
  const parts: string[]=[];let bytes=0,nodes=0
  const seen=new Set<object>(),name=/^[a-zA-Z_][a-zA-Z0-9_.-]*$/
  const push=(text: string)=>{bytes+=Buffer.byteLength(text);if(bytes>1024*1024)throw new Error('Device layout exceeds 1 MiB');parts.push(text)}
  const escape=(value: unknown)=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&apos;')
  function visit(value: any,depth: number) {
    if(!value||typeof value!=='object'||!value.attributes||typeof value.attributes!=='object'||Array.isArray(value.attributes)||seen.has(value)||depth>128||++nodes>20000)throw new Error('Invalid or excessive device layout')
    seen.add(value)
    const {type,...attributes}=value.attributes,tag=typeof type==='string'&&name.test(type)?type:'Layout'
    push(`<${tag}`)
    for(const [key,item] of Object.entries(attributes)){
      if(!name.test(key)||Array.from(String(item)).some(char=>char.charCodeAt(0)<32 && ![9,10,13].includes(char.charCodeAt(0))))throw new Error('Invalid device layout attribute')
      push(` ${key}="${escape(item)}"`)
    }
    push('>')
    if(value.children!==undefined&&!Array.isArray(value.children))throw new Error('Invalid device layout children')
    for(const child of value.children||[])visit(child,depth+1)
    push(`</${tag}>`)
  }
  visit(value,0)
  return parts.join('')
}
