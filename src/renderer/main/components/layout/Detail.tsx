import { observer } from 'mobx-react-lite'
import Style from './Detail.module.scss'
import { Element } from '@xmldom/xmldom'
import { t } from 'common/util'
import copy from 'licia/copy'
import toNum from 'licia/toNum'
import map from 'licia/map'
import filter from 'licia/filter'
import contain from 'licia/contain'
import className from 'licia/className'
import { JSX } from 'react'

interface IProps {
  selected: Element | null
}

export default observer(function Detail(props: IProps) {
  let content: JSX.Element | null = null

  const { selected } = props

  if (selected) {
    const attributes = filter(selected.attributes, (attr) => {
      if (contain(IGNORE_ATTRS, attr.name) || !attr.value) {
        return false
      }

      return true
    })

    content = (
      <div className={Style.detail}>
        <button
          type="button"
          className={Style.title}
          title={t('copy')}
          onClick={() =>
            copy(selected.getAttribute('class') || selected.tagName)
          }
        >
          {selected.getAttribute('class') || selected.tagName}
        </button>
        <div className={Style.boxContainer}>
          <div className={Style.boxTop}>{selected.getAttribute('y')}</div>
          <br />
          <div className={Style.boxLeft}>{selected.getAttribute('x')}</div>
          <div className={Style.box}>
            <div className={Style.size}>{selected.getAttribute('width')}</div> ×{' '}
            <div className={Style.size}>{selected.getAttribute('height')}</div>
          </div>
          <div className={Style.boxRight}>
            {toNum(selected.getAttribute('x')) +
              toNum(selected.getAttribute('width'))}
          </div>
          <br />
          <div className={Style.boxBottom}>
            {toNum(selected.getAttribute('y')) +
              toNum(selected.getAttribute('height'))}
          </div>
        </div>
        <div className={Style.attributes}>
          <table>
            <tbody>
              {map(attributes, (attr) => {
                let value = (
                  <button
                    type="button"
                    title={t('workspaceCopyValue', {
                      name: attr.name,
                      value: attr.value,
                    })}
                    onClick={() => copy(attr.value)}
                  >
                    {attr.value}
                  </button>
                )

                if (attr.value === 'true') {
                  value = (
                    <span
                      className={className('icon-check', Style.true)}
                      role="img"
                      aria-label={t('yes')}
                    />
                  )
                } else if (attr.value === 'false') {
                  value = (
                    <span
                      className={className('icon-delete', Style.false)}
                      role="img"
                      aria-label={t('no')}
                    />
                  )
                }

                return (
                  <tr key={attr.name}>
                    <td className={Style.name}>{attr.name}</td>
                    <td className={Style.value}>{value}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  } else {
    content = (
      <div className={Style.unselected}>{t('componentNotSelected')}</div>
    )
  }

  return <div className={Style.container}>{content}</div>
})

const IGNORE_ATTRS = ['x', 'y', 'width', 'height', 'bounds']
