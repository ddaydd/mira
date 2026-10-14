// Save-image domain: the page menu's "Save Image" / "Save Image As…". Both save
// one image (by its src: http(s), data: or blob:) into the profile's image folder
// (../image-save-dir.ts). "As…" opens the OS save dialog there first, and the
// folder picked becomes the profile's folder for the next saves.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

/** Save-image capability slice, bound to the target window's profile. */
export interface SaveImageContext {
  /** Save the image into the profile's folder under a free name; the saved path. */
  saveImage: (url: string, tabId?: string) => Promise<{ file: string }>
  /** Ask where to save it (OS dialog on the profile's folder); null when cancelled. */
  saveImageAs: (url: string, tabId?: string) => Promise<{ file: string | null }>
  /** The folder the target profile saves images into. */
  getImageSaveDir: () => string
  /** Linux fork: ask for a folder (remembered per profile) and save the video
   * there — a file url fetched directly, a `stream` permalink through yt-dlp.
   * null when cancelled. */
  saveVideoAs: (url: string, stream: boolean, tabId?: string) => Promise<{ file: string | null }>
  /** Linux fork: save the video straight into the profile's last video folder
   * (Downloads when none), no dialog. */
  saveVideo: (url: string, stream: boolean, tabId?: string) => Promise<{ file: string }>
}

function readParams(params: unknown): { url: string; tabId?: string } | string {
  const { url, tabId } = (params ?? {}) as { url?: unknown; tabId?: unknown }
  if (typeof url !== 'string' || url.trim() === '') return 'missing "url"'
  if (tabId !== undefined && (typeof tabId !== 'string' || tabId.trim() === '')) {
    return 'invalid "tabId"'
  }
  return { url: url.trim(), tabId: tabId as string | undefined }
}

export const saveImageCommands: CommandMap<CommandContext> = {
  // params: { url: string, tabId?: string } — tabId names the page the image lives
  // in (a blob: src only resolves there); default: the active tab.
  'save-image': async (ctx, params) => {
    const p = readParams(params)
    if (typeof p === 'string') return { ok: false, error: p }
    try {
      return { ok: true, ...(await ctx.saveImage(p.url, p.tabId)) }
    } catch (error) {
      return fail(error)
    }
  },

  'save-image-as': async (ctx, params) => {
    const p = readParams(params)
    if (typeof p === 'string') return { ok: false, error: p }
    try {
      const { file } = await ctx.saveImageAs(p.url, p.tabId)
      return file ? { ok: true, file } : { ok: true, cancelled: true }
    } catch (error) {
      return fail(error)
    }
  },

  // Linux fork. params: { url: string, stream?: boolean, tabId?: string } —
  // `stream` marks a video page permalink (yt-dlp) rather than a file url.
  'save-video-as': async (ctx, params) => {
    const p = readParams(params)
    if (typeof p === 'string') return { ok: false, error: p }
    const { stream } = (params ?? {}) as { stream?: unknown }
    try {
      const { file } = await ctx.saveVideoAs(p.url, stream === true, p.tabId)
      return file ? { ok: true, file } : { ok: true, cancelled: true }
    } catch (error) {
      return fail(error)
    }
  },

  // Linux fork. Same params as save-video-as; the one-click "Save Video to …".
  'save-video': async (ctx, params) => {
    const p = readParams(params)
    if (typeof p === 'string') return { ok: false, error: p }
    const { stream } = (params ?? {}) as { stream?: unknown }
    try {
      return { ok: true, ...(await ctx.saveVideo(p.url, stream === true, p.tabId)) }
    } catch (error) {
      return fail(error)
    }
  },

  'get-image-save-dir': (ctx) => {
    try {
      return { ok: true, dir: ctx.getImageSaveDir() }
    } catch (error) {
      return fail(error)
    }
  }
}
