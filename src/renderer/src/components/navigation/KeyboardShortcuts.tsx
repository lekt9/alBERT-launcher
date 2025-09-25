import React from 'react'

interface KeyboardShortcutsProps {
  showDocument: boolean
  activePanel: 'none' | 'response' | 'document' | 'settings'
}

const shortcutsRowOne = [
  { combo: 'Esc', label: 'Clear all' },
  { combo: '↑↓', label: 'Navigate results' },
  { combo: 'Enter', label: 'Ask question' }
]

const shortcutsRowTwo = [
  { combo: '⌘/Ctrl + C', label: 'Copy context' },
  { combo: '⌘/Ctrl + K', label: 'Open knowledgebase' },
  { combo: '⌘/Ctrl + N', label: 'New note' }
]

export function KeyboardShortcuts({ showDocument, activePanel }: KeyboardShortcutsProps) {
  const directionalHint =
    activePanel === 'settings'
      ? '← or → exit settings'
      : showDocument
        ? '← remove last document'
        : '← open settings'

  return (
    <div className="glass-panel relative mx-auto mt-8 w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 px-6 py-5 text-[13px] text-slate-200/85 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.85)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: 'radial-gradient(circle at top left, rgba(56,189,248,0.12), transparent 55%)'
        }}
      />
      <div className="relative flex flex-wrap items-center justify-center gap-4 sm:gap-6">
        {[...shortcutsRowOne, { combo: directionalHint, label: 'Panel control' }].map(
          (shortcut) => (
            <ShortcutPill key={shortcut.combo} {...shortcut} />
          )
        )}
      </div>
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
        {shortcutsRowTwo.map((shortcut) => (
          <ShortcutPill key={shortcut.combo} {...shortcut} />
        ))}
      </div>
    </div>
  )
}

interface ShortcutPillProps {
  combo: string
  label: string
}

const ShortcutPill = ({ combo, label }: ShortcutPillProps) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-wide text-slate-100/90">
    <kbd className="rounded-full border border-white/20 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100/80">
      {combo}
    </kbd>
    <span>{label}</span>
  </div>
)
