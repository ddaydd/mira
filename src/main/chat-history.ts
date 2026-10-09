// AI pane conversation history.
//
// The pane holds ONE thread per window, in memory: clearing it, or quitting Mira,
// lost it for good, and the `claude -p` sessions behind it land in Claude Code's
// local transcripts (mixed with terminal sessions), never on claude.ai. This keeps
// every pane conversation per profile (profiles/<id>/chat-history.json), listed in
// Settings → AI chats, where one can be read, copied, reopened in the pane, or
// deleted.
//
// A conversation is identified by an id minted when a window's thread gets its
// first message; each settled turn (status idle) upserts it. Pure list algebra +
// a tiny JSON file store (fs only, no Electron), tested in chat-history.test.ts.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { ChatMessage } from './llm'

/** How many conversations a profile keeps (oldest dropped first). */
export const CHAT_HISTORY_LIMIT = 200

export interface ChatConversation {
  id: string
  /** The pane title (the first prompt or skill name). */
  title: string
  /** The page the conversation started on. */
  url: string
  startedAt: number
  updatedAt: number
  messages: ChatMessage[]
}

/** A conversation without its messages, for lists. */
export interface ChatSummary {
  id: string
  title: string
  url: string
  startedAt: number
  updatedAt: number
  turns: number
  /** The start of the last answer, to recognise a conversation in a list. */
  preview: string
}

/** Insert or replace a conversation by id, keeping the list sorted newest
 * (updatedAt) last and capped. A conversation with no message is not kept. Pure. */
export function upsertConversation(
  list: ChatConversation[],
  conv: ChatConversation,
  limit = CHAT_HISTORY_LIMIT
): ChatConversation[] {
  if (conv.messages.length === 0) return list
  const next = list.filter((c) => c.id !== conv.id)
  next.push(conv)
  next.sort((a, b) => a.updatedAt - b.updatedAt)
  return next.slice(-limit)
}

/** Newest first, without the messages. Pure. */
export function summarize(list: ChatConversation[]): ChatSummary[] {
  return [...list].reverse().map((c) => {
    const answers = c.messages.filter((m) => m.role === 'assistant')
    const last = answers.at(-1)?.text ?? ''
    return {
      id: c.id,
      title: c.title,
      url: c.url,
      startedAt: c.startedAt,
      updatedAt: c.updatedAt,
      turns: c.messages.filter((m) => m.role === 'user').length,
      preview: last.replace(/\s+/g, ' ').trim().slice(0, 160)
    }
  })
}

/** A conversation as plain text (the same shape as the pane's copy-chat). Pure. */
export function conversationText(conv: ChatConversation): string {
  return conv.messages.map((m) => `${m.role === 'user' ? 'You' : 'Claude'}: ${m.text}`).join('\n\n')
}

/** Validate the file content, dropping malformed entries. Pure. */
export function normalizeChatHistory(raw: unknown): ChatConversation[] {
  if (!Array.isArray(raw)) return []
  const out: ChatConversation[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    if (typeof v.id !== 'string' || v.id === '') continue
    if (typeof v.startedAt !== 'number' || typeof v.updatedAt !== 'number') continue
    const messages: ChatMessage[] = []
    for (const m of Array.isArray(v.messages) ? v.messages : []) {
      const mv = (m ?? {}) as Record<string, unknown>
      if ((mv.role === 'user' || mv.role === 'assistant') && typeof mv.text === 'string') {
        messages.push({ role: mv.role, text: mv.text })
      }
    }
    if (messages.length === 0) continue
    out.push({
      id: v.id,
      title: typeof v.title === 'string' ? v.title : '',
      url: typeof v.url === 'string' ? v.url : '',
      startedAt: v.startedAt,
      updatedAt: v.updatedAt,
      messages
    })
  }
  out.sort((a, b) => a.updatedAt - b.updatedAt)
  return out.slice(-CHAT_HISTORY_LIMIT)
}

/** One profile's history on disk. Atomic synchronous writes (a turn settles a few
 * times a minute at most). */
export class ChatHistoryStore {
  private list: ChatConversation[]

  constructor(private readonly path: string) {
    let raw: unknown = []
    try {
      if (existsSync(path)) raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      console.error('[mira] unreadable chat-history.json, starting empty', error)
    }
    this.list = normalizeChatHistory(raw)
  }

  save(conv: ChatConversation): void {
    this.list = upsertConversation(this.list, conv)
    this.write()
  }

  summaries(): ChatSummary[] {
    return summarize(this.list)
  }

  get(id: string): ChatConversation | null {
    return this.list.find((c) => c.id === id) ?? null
  }

  delete(id: string): boolean {
    const before = this.list.length
    this.list = this.list.filter((c) => c.id !== id)
    if (this.list.length === before) return false
    this.write()
    return true
  }

  clear(): number {
    const n = this.list.length
    this.list = []
    this.write()
    return n
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.list), 'utf8')
      renameSync(tmp, this.path)
    } catch (error) {
      console.error('[mira] failed to write chat-history.json', error)
    }
  }
}
