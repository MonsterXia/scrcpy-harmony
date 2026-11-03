const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React

test('layout preview draws only a decoded current image and releases pointer handlers', async (t) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  const images = [],
    drawn = [],
    registered = new Set(),
    viewed = []
  const originalCreate = document.createElement.bind(document)
  document.createElement = function (name) {
    const element = originalCreate(name)
    if (name === 'canvas') {
      element.getContext = () => ({
        clearRect() {},
        drawImage(image) {
          assert.equal(image.loaded, true, 'never draw an undecoded image')
          drawn.push(image)
        },
      })
      const add = element.addEventListener.bind(element),
        remove = element.removeEventListener.bind(element)
      element.addEventListener = (type, fn) => {
        registered.add(fn)
        add(type, fn)
      }
      element.removeEventListener = (type, fn) => {
        registered.delete(fn)
        remove(type, fn)
      }
    }
    return element
  }
  t.after(() => {
    document.createElement = originalCreate
    host.remove()
  })
  class Image {
    constructor() {
      images.push(this)
    }
    set src(value) {
      this.url = value
      assert.equal(
        typeof this.onload,
        'function',
        'handler installed before src',
      )
    }
  }
  const Screenshot = load(
    'src/renderer/main/components/layout/Screenshot.tsx',
    {
      '../../store': { layout: { border: false } },
      'common/theme': { colorPrimary: '#2469db' },
      'luna-image-viewer/react': ({ image }) => {
        viewed.push([image.width, image.height])
        return null
      },
    },
    { Image },
  ).default
  const render = (url) =>
    act(async () =>
      root.render(
        React.createElement(Screenshot, {
          image: { url, width: 10, height: 20 },
          selected: null,
        }),
      ),
    )
  await render('first')
  assert.equal(
    viewed.length,
    0,
    'viewer waits for a decoded canvas with current dimensions',
  )
  const oldImage = images.at(-1),
    late = oldImage.onload
  await render('second')
  const current = images.at(-1)
  assert.notEqual(oldImage, current)
  await act(async () => {
    oldImage.loaded = true
    late()
  })
  assert.equal(drawn.length, 0, 'late image cannot repaint the current canvas')
  await act(async () => {
    current.loaded = true
    current.onload()
  })
  assert.equal(drawn.at(-1), current)
  assert.deepEqual(viewed.at(-1), [10, 20])
  await act(async () => root.unmount())
  assert.equal(registered.size, 0)
})
