import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('production'),
    BRAVE_API_KEY: z.string().trim().min(1).optional(),
    OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
    ELECTRON_RENDERER_URL: z.string().trim().url().optional(),
    VITE_PUBLIC: z.string().trim().optional(),
    HOME: z.string().trim().optional()
  })
  .transform((value) => ({
    nodeEnv: value.NODE_ENV,
    braveApiKey: value.BRAVE_API_KEY,
    openRouterApiKey: value.OPENROUTER_API_KEY,
    electronRendererUrl: value.ELECTRON_RENDERER_URL,
    vitePublic: value.VITE_PUBLIC,
    homeDirectory: value.HOME
  }))

dotenv.config({ path: process.env.AL_CONFIG_PATH || path.resolve(process.cwd(), '.env') })

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const formattedErrors = Object.entries(parsedEnv.error.flatten().fieldErrors)
    .map(([key, errors]) => `${key}: ${errors?.join(', ')}`)
    .join('\n')
  throw new Error(`Invalid environment configuration:\n${formattedErrors}`)
}

export const config = {
  ...parsedEnv.data,
  isDevelopment: parsedEnv.data.nodeEnv === 'development',
  hasBraveApiKey: Boolean(parsedEnv.data.braveApiKey),
  hasOpenRouterApiKey: Boolean(parsedEnv.data.openRouterApiKey)
}

export type AppConfig = typeof config
