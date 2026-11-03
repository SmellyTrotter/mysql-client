import type { Api } from '../../preload/index'

export const api = (window as unknown as { api: Api }).api
