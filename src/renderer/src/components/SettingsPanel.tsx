import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LLMSettings } from '@/types';
import { useTheme } from '@/lib/theme-provider';

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
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    baseUrlRef.current?.focus();
  }, []);

  useEffect(() => {
    setLocalSettings(isPrivate ? privateSettings : publicSettings);
  }, [isPrivate, privateSettings, publicSettings]);

  const handleSaveSettings = (): void => {
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

      <div className="grid gap-6 py-4">
        {/* Theme Toggle */}
        <div className="flex items-center justify-between">
          <div className="grid gap-1">
            <label htmlFor="theme" className="text-sm font-medium">
              Theme
            </label>
            <span className="text-xs text-muted-foreground">
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                "rounded-full w-9 h-9",
                "bg-background/50 hover:bg-background/80",
                "backdrop-blur-sm border border-border/50"
              )}
            >
              {theme === 'dark' ? (
                <Moon className="h-4 w-4 text-primary" />
              ) : (
                <Sun className="h-4 w-4 text-primary" />
              )}
            </Button>
          </div>
        </div>

        {/* Privacy Toggle */}
        <div className="flex items-center justify-between">
          <div className="grid gap-1">
            <label htmlFor="privacy" className="text-sm font-medium">
              Private Mode
            </label>
            <span className="text-xs text-muted-foreground">
              {isPrivate ? 'Using local LLM' : 'Using cloud LLM'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-full w-9 h-9",
                "bg-background/50 hover:bg-background/80",
                "backdrop-blur-sm border border-border/50"
              )}
            >
              {isPrivate ? (
                <Lock className="h-4 w-4 text-primary" />
              ) : (
                <LockOpen className="h-4 w-4 text-primary" />
              )}
            </Button>
            <Switch
              id="privacy"
              checked={isPrivate}
              onCheckedChange={(checked) => {
                setIsPrivate(checked);
                localStorage.setItem('llm-privacy', JSON.stringify(checked));
              }}
              className={cn(
                "data-[state=checked]:bg-primary",
                "bg-input"
              )}
            />
          </div>
        </div>

        {/* Model Settings */}
        <div className="space-y-4">
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
              className="bg-background/50 backdrop-blur-sm border-border/50"
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
              className="bg-background/50 backdrop-blur-sm border-border/50"
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
              className="bg-background/50 backdrop-blur-sm border-border/50"
            />
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setLocalSettings(isPrivate ? privateSettings : publicSettings);
            setActivePanel('none');
          }}
          className="bg-background/50 backdrop-blur-sm border-border/50"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSaveSettings}
          className="bg-primary/80 hover:bg-primary/90"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

SettingsPanel.displayName = 'SettingsPanel';

export default React.memo(SettingsPanel);