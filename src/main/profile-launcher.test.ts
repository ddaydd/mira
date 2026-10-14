import { describe, it, expect } from 'vitest'
import { applicationDirs, launcherForProfile } from './profile-launcher'

const entry = (file: string, exec: string): { file: string; content: string } => ({
  file,
  content: `[Desktop Entry]\nName=X\nExec=${exec}\nType=Application\n`
})

describe('launcherForProfile', () => {
  it('finds the launcher that opens the profile, by --profile <id> or --profile=<id>', () => {
    const entries = [
      entry('mira.desktop', '/opt/Mira/mira-browser %U'),
      entry('mira-termix.desktop', '/opt/Mira/mira-browser --profile p2'),
      entry('mira-leny.desktop', '/opt/Mira/mira-browser --profile=p3 %U')
    ]
    expect(launcherForProfile('p2', entries)).toBe('mira-termix')
    expect(launcherForProfile('p3', entries)).toBe('mira-leny')
    expect(launcherForProfile('default', entries)).toBeNull()
  })

  it('ignores another app that happens to take --profile', () => {
    expect(launcherForProfile('p2', [entry('fx.desktop', 'firefox --profile p2')])).toBeNull()
  })

  it('keeps the first match (user entries are listed first)', () => {
    const entries = [
      entry('mine.desktop', 'mira-browser --profile p2'),
      entry('system.desktop', 'mira-browser --profile p2')
    ]
    expect(launcherForProfile('p2', entries)).toBe('mine')
  })
})

describe('applicationDirs', () => {
  it('puts the user dir before the system ones', () => {
    expect(applicationDirs({}, '/home/u')).toEqual([
      '/home/u/.local/share/applications',
      '/usr/local/share/applications',
      '/usr/share/applications'
    ])
    expect(applicationDirs({ XDG_DATA_HOME: '/d', XDG_DATA_DIRS: '/s' }, '/home/u')).toEqual([
      '/d/applications',
      '/s/applications'
    ])
  })
})
