// @components/SettingsPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LLMSettings } from '@/types';

interface SettingsPanelProps {
  isPrivate: boolean;
  setIsPrivate: (checked: boolean) => void;
  privateSettings: LLMSettings;
  publicSettings: LLMSettings;
  setPrivateSettings: (settings: LLMSettings) => void;
  setPublicSettings: (settings: LLMSettings) => void;
  setActivePanel: (panel: 'none' | 'chat' | 'document' | 'settings') => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isPrivate,
  setIsPrivate,
  privateSettings,
  publicSettings,
  setPrivateSettings,
  setPublicSettings,
  setActivePanel,
}) => {
  const [localSettings, setLocalSettings] = useState<LLMSettings>(isPrivate ? privateSettings : publicSettings);
  const baseUrlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    baseUrlRef.current?.focus();
  }, []);

  useEffect(() => {
    setLocalSettings(isPrivate ? privateSettings : publicSettings);
  }, [isPrivate, privateSettings, publicSettings]);

  const handleSaveSettings = () => {
    if (isPrivate) {
      setPrivateSettings(localSettings);
      localStorage.setItem('llm-settings-private', JSON.stringify(localSettings));
    } else {
      setPublicSettings(localSettings);
      localStorage.setItem('llm-settings-public', JSON.stringify(localSettings));
    }
    setActivePanel('none');
  };

  return (
    <div className="flex flex-col h-full" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Settings</h2>
      </div>
      <div className="grid gap-4 py-4">
        <div className="flex items-center justify-between">
          <div className="grid gap-1">
            <label htmlFor="privacy" className="text-sm font-medium">
              Private Mode
            </label>
            <span className="text-xs text-muted-foreground">
              {isPrivate ? 'Using local LLM' : 'Using cloud LLM'}
            </span>
          </div>
          <Switch
            id="privacy"
            checked={isPrivate}
            onCheckedChange={(checked) => {
              setIsPrivate(checked);
              localStorage.setItem('llm-privacy', JSON.stringify(checked));
            }}
            className="data-[state=checked]:bg-primary"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="baseUrl" className="text-sm font-medium">
            Base URL
          </label>
          <Input
            ref={baseUrlRef}
            id="baseUrl"
            value={localSettings.baseUrl}
            onChange={(e) =>
              setLocalSettings((prev) => ({
                ...prev,
                baseUrl: e.target.value,
              }))
            }
            placeholder={isPrivate ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="apiKey" className="text-sm font-medium">
            API Key {isPrivate && '(Optional)'}
          </label>
          <Input
            id="apiKey"
            type="password"
            value={localSettings.apiKey}
            onChange={(e) =>
              setLocalSettings((prev) => ({
                ...prev,
                apiKey: e.target.value,
              }))
            }
            placeholder={isPrivate ? '' : 'sk-...'}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="model" className="text-sm font-medium">
            Model
          </label>
          <Input
            id="model"
            value={localSettings.model}
            onChange={(e) =>
              setLocalSettings((prev) => ({
                ...prev,
                model: e.target.value,
              }))
            }
            placeholder={isPrivate ? 'llama3.2:1b' : 'gpt-4o-mini'}
          />
        </div>
      </div>
      <div className="mt-auto pt-4 flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setLocalSettings(isPrivate ? privateSettings : publicSettings);
            setActivePanel('none');
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSaveSettings}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

SettingsPanel.displayName = 'SettingsPanel';

export default React.memo(SettingsPanel);