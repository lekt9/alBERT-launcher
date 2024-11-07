import React, { useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { LLMSettings } from '@/types'

interface SettingsPanelProps {
  width: number
  isPrivate: boolean
  currentSettings: LLMSettings
  onPrivacyToggle: (checked: boolean) => void
  onSaveSettings: (settings: LLMSettings) => void
  onClose: () => void
}

export function SettingsPanel({
  width,
  isPrivate,
  currentSettings,
  onPrivacyToggle,
  onSaveSettings,
  onClose
}: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<LLMSettings>(currentSettings)

  return (
    <Card 
      className="bg-white/95 shadow-2xl flex flex-col transition-all duration-200"
      style={{ width }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <CardContent className="p-4 flex flex-col h-full max-h-[600px]">
        {/* Settings content */}
        {/* ... Copy the settings view content from the original file ... */}
      </CardContent>
    </Card>
  )
} 