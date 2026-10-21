import { HttpApi, type Api } from './client'
import { MockApi } from './mock'

// VITE_API=http -> real backend at /api (proxied in dev). Anything else -> mock.
export const api: Api = import.meta.env.VITE_API === 'http' ? new HttpApi() : new MockApi()
export const usingMock = !(api instanceof HttpApi)

export * from './types'
export { ApiError } from './client'
