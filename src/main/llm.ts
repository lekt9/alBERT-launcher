import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria
} from '@huggingface/transformers'
import { logger } from './utils/logger'

class TextGenerationPipeline {
  private static tokenizer: any = null
  private static model: any = null
  private static model_id = 'onnx-community/Llama-3.2-1B-Instruct-q4f16'
  private static stopping_criteria = new InterruptableStoppingCriteria()

  static async getInstance(progress_callback = null) {
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
        progress_callback
      })
    }

    if (!this.model) {
      this.model = await AutoModelForCausalLM.from_pretrained(this.model_id, {
        dtype: 'q4f16',
        device: 'webgpu',
        progress_callback
      })
    }

    return { tokenizer: this.tokenizer, model: this.model }
  }

  static interrupt() {
    this.stopping_criteria.interrupt()
  }

  static reset() {
    this.stopping_criteria.reset()
  }
}

export interface GenerateOptions {
  onToken?: (token: string) => void
  onProgress?: (progress: { tps: number; numTokens: number }) => void
}

export async function generate(
  prompt: string,
  callbacks: {
    onToken?: (token: string) => void
    onProgress?: (progress: number) => void
  } = {}
) {
  const { onToken, onProgress } = callbacks

  try {
    const { tokenizer, model } = await TextGenerationPipeline.getInstance()
    TextGenerationPipeline.reset()

    const inputs = tokenizer.apply_chat_template([prompt], {
      add_generation_prompt: true,
      return_dict: true
    })

    let startTime: number | null = null
    let numTokens = 0
    let tps = 0

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: onToken,
      token_callback_function: () => {
        startTime ??= performance.now()
        if (numTokens++ > 0) {
          tps = (numTokens / (performance.now() - startTime)) * 1000
        }
        onProgress?.({ tps, numTokens })
      }
    })

    const { sequences } = await model.generate({
      ...inputs,
      do_sample: false,
      max_new_tokens: 1024,
      streamer,
      stopping_criteria: TextGenerationPipeline.stopping_criteria,
      return_dict_in_generate: true
    })

    const decoded = tokenizer.batch_decode(sequences, {
      skip_special_tokens: true
    })

    return decoded[0]
  } catch (error) {
    logger.error('Generation error:', error)
    throw error
  }
}

export async function checkGPUSupport(): Promise<boolean> {
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return !!adapter
  } catch (error) {
    logger.error('GPU support check failed:', error)
    return false
  }
}
