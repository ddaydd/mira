// Chat-history domain: the AI pane's past conversations, kept per profile
// (../chat-history.ts). Listed in Settings → AI chats; every action is a command
// so the socket can read, reopen or delete them too. Bound to the target
// window's profile.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'
import type { ChatConversation, ChatSummary } from '../chat-history'

/** Chat-history capability slice. */
export interface ChatHistoryContext {
  listChatHistory: () => ChatSummary[]
  getChatConversation: (id: string) => ChatConversation
  /** Show the conversation in the pane; further turns extend it. */
  openChatConversation: (id: string) => { turns: number }
  copyChatConversation: (id: string) => void
  deleteChatConversation: (id: string) => boolean
  clearChatHistory: () => number
}

function idOf(params: unknown): string | null {
  const id = (params as { id?: unknown } | undefined)?.id
  return typeof id === 'string' && id !== '' ? id : null
}

const MISSING_ID = { ok: false as const, error: '"id" must be a non-empty string' }

export const chatHistoryCommands: CommandMap<CommandContext> = {
  'list-chat-history': (ctx) => {
    try {
      return { ok: true, conversations: ctx.listChatHistory() }
    } catch (error) {
      return fail(error)
    }
  },
  // params: { id }
  'get-chat-conversation': (ctx, params) => {
    const id = idOf(params)
    if (!id) return MISSING_ID
    try {
      return { ok: true, conversation: ctx.getChatConversation(id) }
    } catch (error) {
      return fail(error)
    }
  },
  // params: { id }
  'open-chat-conversation': (ctx, params) => {
    const id = idOf(params)
    if (!id) return MISSING_ID
    try {
      return { ok: true, ...ctx.openChatConversation(id) }
    } catch (error) {
      return fail(error)
    }
  },
  // params: { id }
  'copy-chat-conversation': (ctx, params) => {
    const id = idOf(params)
    if (!id) return MISSING_ID
    try {
      ctx.copyChatConversation(id)
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  },
  // params: { id }
  'delete-chat-conversation': (ctx, params) => {
    const id = idOf(params)
    if (!id) return MISSING_ID
    try {
      return { ok: true, deleted: ctx.deleteChatConversation(id) }
    } catch (error) {
      return fail(error)
    }
  },
  'clear-chat-history': (ctx) => {
    try {
      return { ok: true, cleared: ctx.clearChatHistory() }
    } catch (error) {
      return fail(error)
    }
  }
}
