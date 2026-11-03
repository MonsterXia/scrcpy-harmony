import { observer } from 'mobx-react-lite'
import Style from './Screenshot.module.scss'
import dataUrl from 'licia/dataUrl'
import fileSize from 'licia/fileSize'
import base64 from 'licia/base64'
import convertBin from 'licia/convertBin'
import download from 'licia/download'
import loadImg from 'licia/loadImg'
import LunaImageViewer from 'luna-image-viewer/react'
import ImageViewer from 'luna-image-viewer'
import { useEffect, useRef, useState } from 'react'
import store from '../../store'
import { t } from 'common/util'
import { copyData, notify } from 'share/renderer/lib/util'
import { toPng } from '../../lib/util'

type ScreenshotImage = {
  data: string
  url: string
  width: number
  height: number
  size: number
}
export default observer(function Screenshot() {
  const [image, setImage] = useState<ScreenshotImage | null>(null)
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [copying, setCopying] = useState(false)
  const imageViewerRef = useRef<ImageViewer>(null)
  const session = useRef<{
    active: boolean
    reading: boolean
    copying: boolean
  } | null>(null)
  const key = store.target?.key
  useEffect(() => {
    const current = { active: true, reading: false, copying: false }
    session.current = current
    setImage(null)
    setError(false)
    setLoading(false)
    setCopying(false)
    void recapture()
    return () => {
      current.active = false
    }
  }, [key])
  async function recapture() {
    const current = session.current
    if (
      !key ||
      !current?.active ||
      current.reading ||
      store.target?.key !== key
    )
      return
    const valid = () =>
      current.active && session.current === current && store.target?.key === key
    current.reading = true
    setLoading(true)
    setError(false)
    try {
      const data = await main.screencap(key)
      if (!valid()) return
      const url = dataUrl.stringify(data, 'image/jpeg')
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) =>
          loadImg(url, (error, img) => {
            if (error || !img?.width || !img?.height)
              reject(error || new Error('Invalid image'))
            else resolve({ width: img.width, height: img.height })
          }),
      )
      if (valid())
        setImage({ data, url, ...dimensions, size: base64.decode(data).length })
    } catch {
      if (valid()) {
        setImage(null)
        setError(true)
      }
    } finally {
      current.reading = false
      if (valid()) setLoading(false)
    }
  }
  async function copy() {
    const current = session.current,
      snapshot = image
    if (!current?.active || current.copying || !snapshot) return
    current.copying = true
    setCopying(true)
    try {
      const png = await toPng(snapshot.url)
      if (
        current.active &&
        session.current === current &&
        store.target?.key === key
      ) {
        await copyData(dataUrl.parse(png)!.data, 'image/png')
        notify(t('copied'), { icon: 'success' })
      }
    } catch {
      if (current.active && session.current === current)
        notify(t('commonErr'), { icon: 'error' })
    } finally {
      current.copying = false
      if (current.active && session.current === current) setCopying(false)
    }
  }
  function save() {
    if (image)
      download(convertBin(image.data, 'Blob'), 'screenshot.jpeg', 'image/jpeg')
  }
  const button = (
    icon: string,
    label: string,
    action: () => void,
    disabled = !image,
  ) => (
    <button
      key={icon}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={action}
    >
      <span className={`icon-${icon}`} aria-hidden="true" />
    </button>
  )
  return (
    <div className={Style.page} data-screenshot aria-busy={loading}>
      <header className={Style.heading}>
        <div>
          <h1>{t('screenshot')}</h1>
          <p>{t('workspaceScreenshotHint')}</p>
        </div>
        <button
          className={Style.primary}
          type="button"
          data-action="capture"
          disabled={!key || loading}
          onClick={() => void recapture()}
        >
          <span className="icon-refresh" aria-hidden="true" />
          {t('recapture')}
        </button>
      </header>
      <div className={Style.toolbar}>
        <div role="group" aria-label={t('workspaceExport')}>
          <button type="button" disabled={!image} onClick={save}>
            <span className="icon-save" aria-hidden="true" />
            {t('save')}
          </button>
          <button
            type="button"
            disabled={!image || copying}
            onClick={() => void copy()}
          >
            {t('copy')}
          </button>
        </div>
        <div role="group" aria-label={t('workspaceImageView')}>
          {button('rotate-left', t('rotateLeft'), () =>
            imageViewerRef.current?.rotate(-90),
          )}
          {button('rotate-right', t('rotateRight'), () =>
            imageViewerRef.current?.rotate(90),
          )}
          {button('zoom-in', t('zoomIn'), () =>
            imageViewerRef.current?.zoom(0.1),
          )}
          {button('zoom-out', t('zoomOut'), () =>
            imageViewerRef.current?.zoom(-0.1),
          )}
          {button('original', t('actualSize'), () =>
            imageViewerRef.current?.zoomTo(1),
          )}
          {button('reset', t('reset'), () => imageViewerRef.current?.reset())}
        </div>
        <span className={Style.meta}>
          {image
            ? `${image.width}×${image.height} · JPEG · ${fileSize(image.size)}B`
            : ''}
        </span>
      </div>
      {error && (
        <div className={Style.error} role="alert">
          {t('workspaceScreenshotFailed')}
        </div>
      )}
      <div className={Style.canvas}>
        {image ? (
          <LunaImageViewer
            image={image.url}
            onCreate={(viewer) => {
              imageViewerRef.current = viewer
            }}
          />
        ) : (
          <div className={Style.empty} role="status">
            <span className="icon-camera" aria-hidden="true" />
            <h2>
              {loading
                ? t('workspaceLoading')
                : !key
                  ? t('targetNotConnected')
                  : t('workspaceNoScreenshot')}
            </h2>
            <p>
              {!key
                ? t('workspaceConnectToStart')
                : t('workspaceScreenshotHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
})
