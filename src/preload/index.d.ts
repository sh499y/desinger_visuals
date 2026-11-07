import type { FrontApi } from '../shared/types'

declare global {
  interface Window {
    api: FrontApi
  }
}
