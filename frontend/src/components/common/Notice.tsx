import type { ReactNode } from 'react'
import './Notice.css'

type NoticeProps = {
  title: string
  /** "error" draws the red edge; "info" stays quiet. */
  tone?: 'error' | 'info'
  children: ReactNode
  /** Usually a single retry or reset button. */
  action?: ReactNode
}

/*
 * The one honest "something went wrong / worth knowing" card. It never
 * guesses at a cause: the message it shows is the one the API (or the
 * browser) actually gave us.
 */
export function Notice({ title, tone = 'error', children, action }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <h3>{title}</h3>
      {children}
      {action}
    </div>
  )
}
