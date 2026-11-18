// Single geometry source for the approved Scrcpy Plus identity (1024-unit grid).
// All appearances use the same knockout gap at the screen intersection.
export const shapes = {
  rear: 'M256 288H528A96 96 0 0 1 624 384V436H564V384A36 36 0 0 0 528 348H256A36 36 0 0 0 220 384V568A36 36 0 0 0 256 604H292V664H256A96 96 0 0 1 160 568V384A96 96 0 0 1 256 288Z',
  front: 'M400 448H728A96 96 0 0 1 824 544V720A96 96 0 0 1 728 816H400A96 96 0 0 1 304 720V544A96 96 0 0 1 400 448ZM400 508A36 36 0 0 0 364 544V720A36 36 0 0 0 400 756H728A36 36 0 0 0 764 720V544A36 36 0 0 0 728 508Z',
  plus: 'M748 208H768Q788 208 788 228V284H844Q864 284 864 304V324Q864 344 844 344H788V400Q788 420 768 420H748Q728 420 728 400V344H672Q652 344 652 324V304Q652 284 672 284H728V228Q728 208 748 208Z',
}

export const palettes = {
  light: { background: '#F3F7FD', rear: '#1674ED', front: '#00A6A2', plus: '#173552' },
  dark: { background: '#142239', rear: '#3389FA', front: '#20D9C3', plus: '#F3F7FD' },
  mono: { background: '#F3F3F3', rear: '#252525', front: '#252525', plus: '#252525' },
}

const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${content}</svg>\n`
export const iconSvg = appearance => {
  const colors = palettes[appearance]
  return svg(`<rect x="64" y="64" width="896" height="896" rx="196" fill="${colors.background}"/>` +
    Object.entries(shapes).map(([name, d]) => `<path fill="${colors[name]}" fill-rule="evenodd" d="${d}"/>`).join(''))
}

// Icon Composer owns the background and mask. Expand the artwork from the
// padded legacy tile to the full canvas, preserving its relative placement.
export const layerSvg = name => svg(`<g transform="scale(${1024 / 896}) translate(-64 -64)"><path fill="white" fill-rule="evenodd" d="${shapes[name]}"/></g>`)

const solid = hex => ({ solid: `srgb:${hex.slice(1).match(/../g).map(v => (parseInt(v, 16) / 255).toFixed(5)).join(',')},1.00000` })
const fills = name => [
  { value: solid(palettes.light[name]) },
  { appearance: 'dark', value: solid(palettes.dark[name]) },
  // Native tinted rendering uses luminance as a mask. White foreground gives
  // the system full contrast; dark ink would disappear into the tinted tile.
  { appearance: 'tinted', value: name === 'background' ? 'automatic' : solid('#FFFFFF') },
]

export const composerDocument = {
  'fill-specializations': fills('background'),
  groups: [{
    name: 'Mirroring +',
    layers: Object.keys(shapes).map(name => ({
      name,
      'image-name': `${name}.svg`,
      'fill-specializations': fills(name),
      glass: false,
    })),
    shadow: { kind: 'neutral', opacity: 0 },
    translucency: { enabled: false, value: 0 },
    specular: false,
  }],
  'supported-platforms': { squares: ['macOS'] },
}
