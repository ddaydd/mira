import { describe, expect, it } from 'vitest'
import { saveConflictChoice, saveConflictDialog, ytdlpTemplateFor } from './save-conflict'

describe('saveConflictDialog', () => {
  it('names the file, its folder and the Keep Both copy', () => {
    const d = saveConflictDialog('cat.jpg', '/home/me/Images/', 'cat (1).jpg')
    expect(d.message).toBe('"cat.jpg" already exists in Images.')
    expect(d.detail).toContain('"cat (1).jpg"')
    expect(d.buttons).toEqual(['Replace', 'Keep Both', 'Cancel'])
    expect(d.buttons[d.defaultId]).toBe('Keep Both')
    expect(d.buttons[d.cancelId]).toBe('Cancel')
  })
})

describe('saveConflictChoice', () => {
  it('maps the button index, anything else cancels', () => {
    expect(saveConflictChoice(0)).toBe('replace')
    expect(saveConflictChoice(1)).toBe('keep-both')
    expect(saveConflictChoice(2)).toBe('cancel')
    expect(saveConflictChoice(-1)).toBe('cancel')
  })
})

describe('ytdlpTemplateFor', () => {
  it('keeps the name, lets yt-dlp pick the extension', () => {
    expect(ytdlpTemplateFor('/dl/Me_at_the_zoo (1).webm')).toBe('/dl/Me_at_the_zoo (1).%(ext)s')
  })
  it('escapes % so the title is not a template field', () => {
    expect(ytdlpTemplateFor('/dl/100%_fun (1).mp4')).toBe('/dl/100%%_fun (1).%(ext)s')
  })
})
