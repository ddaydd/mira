import { describe, it, expect, vi } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'

// The store is tested in ../chat-history.test.ts; here only the dispatch.
const conversation = {
  id: 'c1',
  title: 'T',
  url: 'https://e.org/',
  startedAt: 1,
  updatedAt: 2,
  messages: [{ role: 'user' as const, text: 'Q' }]
}

describe('chat-history commands', () => {
  it('lists conversations', () => {
    const { ctx } = makeContext()
    vi.spyOn(ctx, 'listChatHistory').mockReturnValue([])
    expect(createCommandRegistry().execute('list-chat-history', {}, ctx)).toEqual({
      ok: true,
      conversations: []
    })
  })

  it('gets, opens, copies and deletes by id', () => {
    const { ctx } = makeContext()
    const reg = createCommandRegistry()
    vi.spyOn(ctx, 'getChatConversation').mockReturnValue(conversation)
    const open = vi.spyOn(ctx, 'openChatConversation').mockReturnValue({ turns: 1 })
    const copy = vi.spyOn(ctx, 'copyChatConversation')
    vi.spyOn(ctx, 'deleteChatConversation').mockReturnValue(true)
    expect(reg.execute('get-chat-conversation', { id: 'c1' }, ctx)).toEqual({
      ok: true,
      conversation
    })
    expect(reg.execute('open-chat-conversation', { id: 'c1' }, ctx)).toEqual({ ok: true, turns: 1 })
    expect(open).toHaveBeenCalledWith('c1')
    expect(reg.execute('copy-chat-conversation', { id: 'c1' }, ctx)).toEqual({ ok: true })
    expect(copy).toHaveBeenCalledWith('c1')
    expect(reg.execute('delete-chat-conversation', { id: 'c1' }, ctx)).toEqual({
      ok: true,
      deleted: true
    })
  })

  it('refuses a missing id', () => {
    const { ctx } = makeContext()
    for (const name of [
      'get-chat-conversation',
      'open-chat-conversation',
      'delete-chat-conversation'
    ]) {
      expect(createCommandRegistry().execute(name, {}, ctx)).toEqual({
        ok: false,
        error: '"id" must be a non-empty string'
      })
    }
  })

  it('reports an unknown conversation', () => {
    const { ctx } = makeContext()
    expect(
      createCommandRegistry().execute('get-chat-conversation', { id: 'zz' }, ctx)
    ).toMatchObject({
      ok: false,
      error: 'unknown conversation: zz'
    })
  })

  it('clears the history', () => {
    const { ctx } = makeContext()
    vi.spyOn(ctx, 'clearChatHistory').mockReturnValue(4)
    expect(createCommandRegistry().execute('clear-chat-history', {}, ctx)).toEqual({
      ok: true,
      cleared: 4
    })
  })
})
