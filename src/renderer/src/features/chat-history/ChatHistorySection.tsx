import { useEffect, useState } from 'react'
import MarkdownView from '../../MarkdownView'
import { timeAgo } from '../audio-history/time-ago'

// Settings → AI chats: every AI-pane conversation of this profile, newest first
// (list-chat-history, kept by main in profiles/<id>/chat-history.json). A row
// unfolds the conversation; it can be reopened in the pane (to continue it),
// copied, or deleted. Every action is a registry command.

/** Mirrors ChatSummary in src/main/chat-history.ts. */
interface ChatSummary {
  id: string
  title: string
  url: string
  startedAt: number
  updatedAt: number
  turns: number
  preview: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

async function run(name: string, params?: unknown): Promise<Record<string, unknown>> {
  return (await window.mira.command(name, params)) as Record<string, unknown>
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

export function ChatHistorySection(): React.JSX.Element {
  const [list, setList] = useState<ChatSummary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = (): void => {
    void run('list-chat-history').then((res) => {
      if (res.ok) {
        setList((res.conversations as ChatSummary[]) ?? [])
        setError(null)
      } else setError(String(res.error))
      setNow(Date.now())
    })
  }

  useEffect(() => {
    load()
    // A turn answered in the pane saves the conversation: refresh on a slow tick.
    const tick = setInterval(load, 15_000)
    return () => clearInterval(tick)
  }, [])

  const toggle = async (id: string): Promise<void> => {
    if (openId === id) {
      setOpenId(null)
      return
    }
    const res = await run('get-chat-conversation', { id })
    if (!res.ok) return setError(String(res.error))
    setMessages((res.conversation as { messages: ChatMessage[] }).messages)
    setOpenId(id)
  }

  const act = async (name: string, id: string): Promise<void> => {
    const res = await run(name, { id })
    if (!res.ok) setError(String(res.error))
    if (name === 'delete-chat-conversation') {
      if (openId === id) setOpenId(null)
      load()
    }
  }

  const clearAll = async (): Promise<void> => {
    const res = await run('clear-chat-history')
    if (!res.ok) setError(String(res.error))
    setOpenId(null)
    load()
  }

  return (
    <div className="settings-section">
      <p className="settings-hint">
        Every conversation of the AI panel (◪), newest first. Click one to read it; reopen it in the
        panel to continue it. Kept on this computer only, per profile.
      </p>
      {list.length > 0 && (
        <div className="settings-section-head">
          <button className="btn btn-ghost" onClick={() => void clearAll()}>
            Delete all
          </button>
        </div>
      )}
      {error && <p className="settings-error">{error}</p>}
      {list.length === 0 ? (
        <p className="settings-hint">No conversation yet.</p>
      ) : (
        <ul className="chat-history-list">
          {list.map((c) => (
            <li key={c.id} className={`chat-history-item${openId === c.id ? ' open' : ''}`}>
              <button className="chat-history-row" onClick={() => void toggle(c.id)}>
                <span className="chat-history-title">{c.title || 'Untitled'}</span>
                <span className="chat-history-meta">
                  {hostOf(c.url)} · {c.turns} {c.turns > 1 ? 'questions' : 'question'} ·{' '}
                  <span title={new Date(c.updatedAt).toLocaleString()}>
                    {timeAgo(c.updatedAt, now)}
                  </span>
                </span>
                {openId !== c.id && c.preview && (
                  <span className="chat-history-preview">{c.preview}</span>
                )}
              </button>
              {openId === c.id && (
                <div className="chat-history-body">
                  <div className="chat-history-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => void act('open-chat-conversation', c.id)}
                    >
                      Open in panel
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => void act('copy-chat-conversation', c.id)}
                    >
                      Copy
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => void act('delete-chat-conversation', c.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {messages.map((m, i) => (
                    <div key={i} className={`chat-history-msg ${m.role}`}>
                      {m.role === 'user' ? <p>{m.text}</p> : <MarkdownView text={m.text} />}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
