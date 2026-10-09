import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CHAT_HISTORY_LIMIT,
  ChatHistoryStore,
  conversationText,
  normalizeChatHistory,
  summarize,
  upsertConversation,
  type ChatConversation
} from './chat-history'

function conv(id: string, updatedAt = 1, turns = 1): ChatConversation {
  const messages: ChatConversation['messages'] = []
  for (let i = 0; i < turns; i++) {
    messages.push({ role: 'user', text: `Q${i}` }, { role: 'assistant', text: `A${i}` })
  }
  return { id, title: `T ${id}`, url: 'https://e.org/', startedAt: 1, updatedAt, messages }
}

describe('upsertConversation', () => {
  it('replaces by id and keeps newest last', () => {
    let list = upsertConversation([], conv('a', 1))
    list = upsertConversation(list, conv('b', 2))
    list = upsertConversation(list, conv('a', 3, 2))
    expect(list.map((c) => [c.id, c.messages.length])).toEqual([
      ['b', 2],
      ['a', 4]
    ])
  })

  it('ignores an empty conversation', () => {
    expect(upsertConversation([], { ...conv('a'), messages: [] })).toEqual([])
  })

  it('drops the oldest past the limit', () => {
    let list: ChatConversation[] = []
    for (let i = 0; i < CHAT_HISTORY_LIMIT + 2; i++)
      list = upsertConversation(list, conv(`c${i}`, i))
    expect(list).toHaveLength(CHAT_HISTORY_LIMIT)
    expect(list[0].id).toBe('c2')
  })
})

describe('summarize', () => {
  it('lists newest first with turn count and last answer preview', () => {
    const out = summarize([conv('a', 1), conv('b', 2, 3)])
    expect(out.map((s) => s.id)).toEqual(['b', 'a'])
    expect(out[0]).toMatchObject({ turns: 3, preview: 'A2', title: 'T b' })
  })
})

describe('conversationText', () => {
  it('labels each turn', () => {
    expect(conversationText(conv('a'))).toBe('You: Q0\n\nClaude: A0')
  })
})

describe('normalizeChatHistory', () => {
  it('keeps valid conversations and drops malformed ones', () => {
    const out = normalizeChatHistory([
      conv('a'),
      { ...conv('b'), id: '' },
      { ...conv('c'), updatedAt: 'x' },
      { ...conv('d'), messages: [{ role: 'system', text: 'x' }] },
      null
    ])
    expect(out.map((c) => c.id)).toEqual(['a'])
    expect(normalizeChatHistory('nope')).toEqual([])
  })
})

describe('ChatHistoryStore', () => {
  it('persists, deletes and clears across instances', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'mira-chat-')), 'p', 'chat-history.json')
    const a = new ChatHistoryStore(path)
    a.save(conv('a', 1))
    a.save(conv('b', 2))
    const b = new ChatHistoryStore(path)
    expect(b.summaries().map((s) => s.id)).toEqual(['b', 'a'])
    expect(b.get('a')?.messages).toHaveLength(2)
    expect(b.delete('a')).toBe(true)
    expect(b.delete('a')).toBe(false)
    expect(new ChatHistoryStore(path).summaries().map((s) => s.id)).toEqual(['b'])
    expect(b.clear()).toBe(1)
    expect(new ChatHistoryStore(path).summaries()).toEqual([])
  })

  it('starts empty on a corrupt file', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'mira-chat-')), 'chat-history.json')
    writeFileSync(path, '{oops')
    expect(new ChatHistoryStore(path).summaries()).toEqual([])
  })
})
