import { observer } from 'mobx-react-lite'
import Style from './Tree.module.scss'
import LunaDomViewer from 'luna-dom-viewer/react'
import DomViewer from 'luna-dom-viewer'
import store from '../../store'
import contain from 'licia/contain'
import { JSX, useEffect, useRef, useState } from 'react'
import uuid from 'licia/uuid'
import xpath from 'licia/xpath'
import copy from 'licia/copy'
import { Document, Element } from '@xmldom/xmldom'
import { t } from 'common/util'
import { PannelLoading } from '../common/loading'

interface IProps {
  hierarchy?: Document
  selected: Element | null
  isLoading: boolean
  onSelect?: (el: Element) => void
  onDomViewerCreate?: (domViewer: DomViewer) => void
}

export default observer(function Tree(props: IProps) {
  const treeRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<DomViewer>(null)
  const [key, setKey] = useState(uuid())

  useEffect(() => {
    setKey(uuid())
  }, [props.hierarchy])

  const path = props.selected
    ? xpath(props.selected as any, true).replace(/^\/Layout/, '')
    : ''

  let content: JSX.Element | null = null
  if (props.isLoading && !props.hierarchy) {
    content = <PannelLoading />
  } else if (props.hierarchy) {
    content = (
      <LunaDomViewer
        theme={store.theme}
        node={props.hierarchy.documentElement as any}
        ignoreAttr={(el, name, value) => {
          let ignore = contain(IGNORE_ATTRS, name) || value === ''
          if (!ignore && !store.layout.attribute) {
            ignore = contain(IGNORE_ATTRS_ALL, name)
          }
          return ignore
        }}
        observe={false}
        lowerCaseTagName={false}
        onSelect={(node) => {
          if (node.nodeType === 1) {
            props.onSelect?.(node as any)
          } else if (node.nodeType === 3) {
            props.onSelect?.(node.parentNode as any)
          }
        }}
        onCreate={(viewer) => {
          viewerRef.current = viewer
          props.onDomViewerCreate?.(viewer)
          if (props.selected) {
            const focused = document.activeElement as HTMLElement | null
            viewer.select(props.selected as any)
            if (focused?.isConnected && focused !== document.body)
              focused.focus()
          }
        }}
      />
    )
  }

  return (
    <div className={Style.container} ref={treeRef}>
      <div
        className={Style.tree}
        key={`${key}:${store.layout.attribute}`}
        role="tree"
        aria-label={t('layoutTree')}
        tabIndex={props.hierarchy ? 0 : -1}
        onFocus={(event) => {
          if (event.target === event.currentTarget && props.hierarchy)
            viewerRef.current?.select(
              (props.selected || props.hierarchy.documentElement) as any,
            )
        }}
      >
        {content}
      </div>
      <div className={Style.xpathContainer}>
        <div className={Style.xpath}>{path || t('componentNotSelected')}</div>
        <button
          type="button"
          aria-label={t('copy')}
          title={t('copy')}
          disabled={!path}
          onClick={() => {
            if (path) copy(path)
          }}
        >
          <span className="icon-copy" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
})

const IGNORE_ATTRS_ALL = [
  'abilityName',
  'accessibilityId',
  'backgroundColor',
  'backgroundImage',
  'bundleName',
  'hashcode',
  'hierarchy',
  'hostWindowId',
  'longClickable',
  'opacity',
  'origBounds',
  'pagePath',
  'visible',
  'zIndex',
  'bounds',
  'checkable',
  'checked',
  'clickable',
  'enabled',
  'focused',
  'scrollable',
  'selected',
  'hitTestBehavior',
  'key',
]

const IGNORE_ATTRS = ['text', 'x', 'y', 'width', 'height']
