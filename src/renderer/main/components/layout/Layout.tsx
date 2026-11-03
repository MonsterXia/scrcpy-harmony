import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import Style from './Layout.module.scss'
import Tree from './Tree'
import Detail from './Detail'
import Screenshot, { IImage } from './Screenshot'
import { Children, useEffect, useRef, useState } from 'react'
import store from '../../store'
import copy from 'licia/copy'
import dataUrl from 'licia/dataUrl'
import each from 'licia/each'
import toNum from 'licia/toNum'
import toStr from 'licia/toStr'
import { xmlToDom } from '../../lib/util'
import { Document, Element } from '@xmldom/xmldom'
import loadImg from 'licia/loadImg'
import download from 'licia/download'
import ImageViewer from 'luna-image-viewer'
import DomViewer from 'luna-dom-viewer'
import isEmpty from 'licia/isEmpty'
import LunaSplitPane, { LunaSplitPaneItem } from 'luna-split-pane/react'

export default observer(function Layout() {
  const [image, setImage] = useState<IImage>({ url: '', width: 0, height: 0 })
  const imageViewerRef = useRef<ImageViewer>(null)
  const domViewerRef = useRef<DomViewer>(null)
  const windowHierarchyRef = useRef('')
  const [hierarchy, setHierarchy] = useState<Document | null>(null)
  const [selected, setSelected] = useState<Element | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const [compact, setCompact] = useState(true)
  const [properties, setProperties] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const propertiesButton = useRef<HTMLButtonElement>(null)
  const session = useRef<{ active: boolean; busy: boolean } | null>(null)
  const { layout } = store
  const key = store.target?.key

  useEffect(() => {
    const current = { active: true, busy: false }
    session.current = current
    setImage({ url: '', width: 0, height: 0 })
    setHierarchy(null)
    setSelected(null)
    setProperties(false)
    setError(false)
    setIsLoading(false)
    windowHierarchyRef.current = ''
    void refresh()
    return () => {
      current.active = false
    }
  }, [key])
  useEffect(() => {
    if (!surface.current) return
    const measure = (width: number) => {
      if (width <= 0) return
      setCompact(width < 1000)
      if (width >= 1000) setProperties(false)
    }
    measure(surface.current.clientWidth)
    const observer = new ResizeObserver((entries) =>
      measure(entries[0].contentRect.width),
    )
    observer.observe(surface.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!properties) return
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      propertiesButton.current?.focus()
    }
  }, [properties])

  async function refresh() {
    const current = session.current
    if (!key || !current?.active || current.busy || store.target?.key !== key)
      return
    const valid = () =>
      current.active && session.current === current && store.target?.key === key
    current.busy = true
    setIsLoading(true)
    setError(false)
    let stage = 'capture'
    try {
      const data = await main.screencap(key)
      if (!valid()) return
      const url = dataUrl.stringify(data, 'image/png')
      stage = 'decode'
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          loadImg(url, (error, img) => {
            if (error || !img?.width || !img?.height)
              reject(error || new Error('Invalid image'))
            else resolve({ width: img.width, height: img.height })
          })
        },
      )
      if (!valid()) return
      stage = 'hierarchy'
      const xml = await main.dumpLayout(key)
      if (!valid()) return
      stage = 'parse'
      const doc = xmlToDom(xml)
      if (
        !doc.documentElement ||
        doc.getElementsByTagName('parsererror').length
      )
        throw new Error('Invalid layout')
      stage = 'transform'
      transformHierarchy(doc)
      windowHierarchyRef.current = xml
      setImage({ url, ...dimensions })
      setHierarchy(doc)
      setSelected(null)
    } catch (error) {
      if (valid()) {
        console.error('Layout read failed', {
          stage,
          reason: error instanceof Error ? error.name : 'Error',
        })
        setError(true)
      }
    } finally {
      current.busy = false
      if (valid()) setIsLoading(false)
    }
  }
  function select(el: Element) {
    domViewerRef.current?.select(el as any)
    setSelected(el)
  }
  const iconButton = (
    icon: string,
    label: string,
    action: () => void,
    disabled = !image.url,
  ) => (
    <button
      key={icon}
      type="button"
      title={label}
      aria-label={label}
      onClick={action}
      disabled={disabled}
    >
      <span className={`icon-${icon}`} aria-hidden="true" />
    </button>
  )
  return (
    <div className={Style.page} ref={surface} data-layout aria-busy={isLoading}>
      <div
        className={Style.surface}
        inert={properties}
        aria-hidden={properties || undefined}
      >
        <header className={Style.heading}>
          <div>
            <h1>{t('layout')}</h1>
            <p>{t('layoutDescription')}</p>
          </div>
          <button
            type="button"
            className={Style.primary}
            disabled={!key || isLoading}
            onClick={() => void refresh()}
          >
            {t('refresh')}
          </button>
        </header>
        <div className={Style.toolbar}>
          <div role="group" aria-label={t('workspaceExport')}>
            <button
              type="button"
              disabled={!hierarchy}
              onClick={() =>
                download(
                  windowHierarchyRef.current,
                  'window_hierarchy.xml',
                  'text/xml',
                )
              }
            >
              {t('save')}
            </button>
            <button
              type="button"
              disabled={!hierarchy}
              onClick={() => copy(windowHierarchyRef.current)}
            >
              {t('copy')}
            </button>
          </div>
          <div role="group" aria-label={t('layoutTree')}>
            {iconButton(
              'expand',
              t('expandAll'),
              () => domViewerRef.current?.expand(true),
              !hierarchy,
            )}
            {iconButton(
              'collapse',
              t('collapseAll'),
              () => domViewerRef.current?.collapse(true),
              !hierarchy,
            )}
            <label>
              <input
                type="checkbox"
                checked={layout.attribute}
                onChange={(event) =>
                  layout.set('attribute', event.target.checked)
                }
              />
              {t('showAttr')}
            </label>
          </div>
          <div role="group" aria-label={t('workspaceImageView')}>
            {iconButton('rotate-left', t('rotateLeft'), () =>
              imageViewerRef.current?.rotate(-90),
            )}
            {iconButton('rotate-right', t('rotateRight'), () =>
              imageViewerRef.current?.rotate(90),
            )}
            {iconButton('zoom-in', t('zoomIn'), () =>
              imageViewerRef.current?.zoom(0.1),
            )}
            {iconButton('zoom-out', t('zoomOut'), () =>
              imageViewerRef.current?.zoom(-0.1),
            )}
            {iconButton('original', t('actualSize'), () =>
              imageViewerRef.current?.zoomTo(1),
            )}
            {iconButton('reset', t('reset'), () =>
              imageViewerRef.current?.reset(),
            )}
            <label>
              <input
                type="checkbox"
                checked={layout.border}
                onChange={(event) => layout.set('border', event.target.checked)}
              />
              {t('showBorder')}
            </label>
          </div>
          {compact && (
            <button
              ref={propertiesButton}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={properties}
              onClick={() => setProperties(true)}
            >
              {t('layoutProperties')}
            </button>
          )}
          <span className={Style.meta}>
            {image.url ? `${image.width}×${image.height}` : ''}
          </span>
        </div>
        {error && (
          <div role="alert" className={Style.error}>
            <span>{t('layoutLoadError')}</span>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void refresh()}
            >
              {t('retry')}
            </button>
          </div>
        )}
        <div className={Style.body}>
          <LunaSplitPane
            key={compact ? 'compact' : 'wide'}
            onResize={(weights) => {
              if (!compact && weights.length === 3)
                layout.set('weights', weights)
            }}
          >
            {Children.toArray([
              <LunaSplitPaneItem
                key="tree"
                minSize={200}
                weight={layout.weights[0]}
              >
                <Tree
                  hierarchy={hierarchy || undefined}
                  isLoading={isLoading}
                  onSelect={select}
                  selected={selected}
                  onDomViewerCreate={(viewer) => {
                    viewer.expand()
                    domViewerRef.current = viewer
                  }}
                />
              </LunaSplitPaneItem>,
              <LunaSplitPaneItem
                key="preview"
                minSize={200}
                weight={layout.weights[1]}
              >
                <Screenshot
                  image={image}
                  hierarchy={hierarchy || undefined}
                  selected={selected}
                  onImageViewerCreate={(viewer) => {
                    imageViewerRef.current = viewer
                  }}
                  onSelect={select}
                />
              </LunaSplitPaneItem>,
              !compact && (
                <LunaSplitPaneItem
                  key="properties"
                  minSize={250}
                  weight={layout.weights[2]}
                >
                  <Detail selected={selected} />
                </LunaSplitPaneItem>
              ),
            ])}
          </LunaSplitPane>
          {!hierarchy && !error && (
            <div className={Style.empty} role="status">
              {t(
                !key
                  ? 'targetNotConnected'
                  : isLoading
                    ? 'workspaceLoading'
                    : 'layoutEmpty',
              )}
            </div>
          )}
        </div>
      </div>
      {compact && properties && (
        <div
          className={Style.overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProperties(false)
          }}
        >
          <aside
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label={t('layoutProperties')}
            className={Style.drawer}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setProperties(false)
              }
              if (event.key !== 'Tab') return
              const controls = Array.from(
                dialog.current?.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), [tabindex="0"]',
                ) || [],
              )
              const first = controls[0],
                last = controls.at(-1)
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
              }
            }}
          >
            <header>
              <h2>{t('layoutProperties')}</h2>
              <button
                type="button"
                aria-label={t('close')}
                onClick={() => setProperties(false)}
              >
                ×
              </button>
            </header>
            <div className={Style.drawerBody}>
              <Detail selected={selected} />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
})

function transformHierarchy(hierarchy: Document) {
  const transformRecursively = (el: Element) => {
    const bounds = el.getAttribute('bounds')
    if (bounds) {
      const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
      if (match) {
        const left = toNum(match[1])
        const top = toNum(match[2])
        const right = toNum(match[3])
        const bottom = toNum(match[4])
        el.setAttribute('x', toStr(left))
        el.setAttribute('y', toStr(top))
        el.setAttribute('width', toStr(right - left))
        el.setAttribute('height', toStr(bottom - top))
      }
    }

    const text = el.getAttribute('text')
    if (text && isEmpty(el.childNodes)) {
      el.appendChild(hierarchy.createTextNode(text))
    } else {
      each(el.childNodes, (child) => {
        if (child.nodeType === 1) transformRecursively(child as Element)
      })
    }
  }

  if (hierarchy.documentElement) {
    transformRecursively(hierarchy.documentElement)
  }
}
