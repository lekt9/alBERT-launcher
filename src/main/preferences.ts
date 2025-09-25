import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'

interface PreferenceStore {
  watchDirectory: string
}

const preferenceFilePath = (): string => path.join(app.getPath('userData'), 'preferences.json')

const defaultWatchDirectory = (): string => path.join(app.getPath('home'), 'alBERT')

let cachedPreferences: PreferenceStore | null = null

const normalisePreferences = (
  input: Partial<PreferenceStore> | null | undefined
): PreferenceStore => {
  const watchDirectory =
    typeof input?.watchDirectory === 'string' && input.watchDirectory.trim().length > 0
      ? input.watchDirectory
      : defaultWatchDirectory()

  return {
    watchDirectory: path.resolve(watchDirectory)
  }
}

const writePreferencesToDisk = async (preferences: PreferenceStore): Promise<void> => {
  const filePath = preferenceFilePath()
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, JSON.stringify(preferences, null, 2), 'utf-8')
}

const readPreferencesFromDisk = async (): Promise<PreferenceStore> => {
  const filePath = preferenceFilePath()

  try {
    const raw = await fsp.readFile(filePath, 'utf-8')
    return normalisePreferences(JSON.parse(raw))
  } catch (error) {
    const prefs = normalisePreferences(null)
    await writePreferencesToDisk(prefs)
    return prefs
  }
}

const ensurePreferences = async (): Promise<PreferenceStore> => {
  if (cachedPreferences) {
    return cachedPreferences
  }

  cachedPreferences = await readPreferencesFromDisk()
  return cachedPreferences
}

export const getDefaultWatchDirectory = (): string => defaultWatchDirectory()

export const getWatchDirectory = async (): Promise<string> => {
  const preferences = await ensurePreferences()
  return preferences.watchDirectory
}

export const getWatchDirectorySync = (): string => {
  if (cachedPreferences) {
    return cachedPreferences.watchDirectory
  }

  const filePath = preferenceFilePath()

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    cachedPreferences = normalisePreferences(JSON.parse(raw))
  } catch (error) {
    cachedPreferences = normalisePreferences(null)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(cachedPreferences, null, 2), 'utf-8')
  }

  return cachedPreferences.watchDirectory
}

export const setWatchDirectory = async (directory: string): Promise<string> => {
  const preferences = await ensurePreferences()
  const resolved = path.resolve(directory)
  const nextPreferences: PreferenceStore = {
    ...preferences,
    watchDirectory: resolved
  }

  cachedPreferences = nextPreferences
  await writePreferencesToDisk(nextPreferences)
  return nextPreferences.watchDirectory
}
