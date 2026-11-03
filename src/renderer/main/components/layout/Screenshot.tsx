import { observer } from 'mobx-react-lite'
import Style from './Screenshot.module.scss'
import { useEffect, useRef, useState } from 'react'
import { Document, Element } from '@xmldom/xmldom'
import store from '../../store'
import each from 'licia/each'
import toNum from 'licia/toNum'
import { colorPrimary } from 'common/theme'
import LunaImageViewer from 'luna-image-viewer/react'
import ImageViewer from 'luna-image-viewer'
import pointerEvent from 'licia/pointerEvent'

interface IProps {
  image: IImage
  hierarchy?: Document
  selected: Element | null
  onSelect?: (el: Element) => void
  onImageViewerCreate?: (imageViewer: ImageViewer) => void
}

export interface IImage {
  url: string
  width: number
  height: number
}

export default observer(function Screenshot(props: IProps) {
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const imageRef = useRef<HTMLImageElement | null>(null)
  const propsRef = useRef(props)
  const [ready, setReady] = useState('')
  const border = store.layout.border

  useEffect(() => {
    propsRef.current = props
  }, [props])
  useEffect(() => {
    const canvas = canvasRef.current
    let isClick = true
    const down = () => {
      isClick = true
    }
    const move = () => {
      isClick = false
    }
    const up = (e: MouseEvent) => {
      const props = propsRef.current
      if (!props.hierarchy || !isClick || !canvas.clientWidth) return
      const ratio = props.image.width / canvas.clientWidth
      const el = findEl(
        props.hierarchy,
        Math.round(e.offsetX * ratio),
        Math.round(e.offsetY * ratio),
      )
      if (el) props.onSelect?.(el)
    }
    canvas.addEventListener(pointerEvent('down') as any, down)
    canvas.addEventListener(pointerEvent('move') as any, move)
    canvas.addEventListener(pointerEvent('up') as any, up)
    return () => {
      canvas.removeEventListener(pointerEvent('down') as any, down)
      canvas.removeEventListener(pointerEvent('move') as any, move)
      canvas.removeEventListener(pointerEvent('up') as any, up)
    }
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    canvas.width = props.image.width
    canvas.height = props.image.height
    imageRef.current = null
    setReady('')
    if (!props.image.url) return
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      imageRef.current = image
      draw()
      setReady(props.image.url)
    }
    image.src = props.image.url
    return () => {
      active = false
      image.onload = null
      image.onerror = null
      imageRef.current = null
    }
  }, [props.image])
  useEffect(() => {
    draw()
  }, [props.hierarchy, props.selected, border])

  function draw() {
    const props = propsRef.current
    const image = imageRef.current
    if (!image || !props.image.url) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, props.image.width, props.image.height)
    ctx.drawImage(image, 0, 0)
    if (store.layout.border && props.hierarchy) drawBorder(ctx, props.hierarchy)
    if (props.selected) drawSelected(ctx, props.selected)
  }

  return (
    <div className={Style.container}>
      {props.image.url && ready === props.image.url && (
        <LunaImageViewer
          image={canvasRef.current}
          onCreate={props.onImageViewerCreate}
        />
      )}
    </div>
  )
})

function findEl(hierarchy: Document, pointerX: number, pointerY: number) {
  let result = hierarchy.documentElement
  let resultWidth = 1000000
  let resultHeight = 1000000

  const findRecursively = (el: Element) => {
    const x = el.getAttribute('x')
    const y = el.getAttribute('y')
    const width = el.getAttribute('width')
    const height = el.getAttribute('height')
    if (x && y && width && height) {
      const x1 = toNum(x)
      const y1 = toNum(y)
      const w = toNum(width)
      const h = toNum(height)
      const x2 = x1 + w
      const y2 = y1 + h
      if (
        x1 <= pointerX &&
        pointerX <= x2 &&
        y1 <= pointerY &&
        pointerY <= y2
      ) {
        if (w * h <= resultWidth * resultHeight) {
          result = el
          resultWidth = w
          resultHeight = h
        }
      }
    }

    each(el.childNodes, (child) => {
      if (child.nodeType !== 1) {
        return
      }
      findRecursively(child as Element)
    })
  }

  if (hierarchy.documentElement) {
    findRecursively(hierarchy.documentElement)
  }

  return result
}

function drawBorder(ctx: CanvasRenderingContext2D, hierarchy: Document) {
  ctx.strokeStyle = colorPrimary
  ctx.lineWidth = 2

  const drawRecursively = (el: Element) => {
    const x = el.getAttribute('x')
    const y = el.getAttribute('y')
    const width = el.getAttribute('width')
    const height = el.getAttribute('height')
    if (x && y && width && height) {
      ctx.strokeRect(toNum(x), toNum(y), toNum(width), toNum(height))
    }

    each(el.childNodes, (child) => {
      if (child.nodeType !== 1) {
        return
      }
      drawRecursively(child as Element)
    })
  }

  if (hierarchy.documentElement) {
    drawRecursively(hierarchy.documentElement)
  }
}

function drawSelected(ctx: CanvasRenderingContext2D, selected: Element) {
  ctx.fillStyle = 'rgba(147,196,125,.55)'

  const x = selected.getAttribute('x')
  const y = selected.getAttribute('y')
  const width = selected.getAttribute('width')
  const height = selected.getAttribute('height')
  if (x && y && width && height) {
    ctx.fillRect(toNum(x), toNum(y), toNum(width), toNum(height))
  }
}
