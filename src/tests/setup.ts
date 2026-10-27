import '@testing-library/jest-dom/vitest'
import { TextEncoder as UtilTextEncoder, TextDecoder as UtilTextDecoder } from 'util'
import * as streamWeb from 'stream/web'

// Polyfill web APIs for jsdom and undici in test environments where they might be missing or incomplete
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = UtilTextEncoder as typeof globalThis.TextEncoder
  globalThis.TextDecoder = UtilTextDecoder as typeof globalThis.TextDecoder
}

if (typeof globalThis.Response === 'undefined' && typeof Response !== 'undefined') {
  globalThis.Response = Response
}

if (typeof globalThis.CompressionStream === 'undefined' && streamWeb.CompressionStream) {
  globalThis.CompressionStream = streamWeb.CompressionStream as unknown as typeof globalThis.CompressionStream
  if (streamWeb.DecompressionStream) {
    globalThis.DecompressionStream = streamWeb.DecompressionStream as unknown as typeof globalThis.DecompressionStream
  }
}

