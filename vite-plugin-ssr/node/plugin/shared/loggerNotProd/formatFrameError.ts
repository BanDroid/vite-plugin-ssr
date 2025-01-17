export { formatFrameError }
export { isFrameError }
export type { FrameError }

// For ./formatFrameError.spec.ts
export { getErrMsg }

// Copied & adapted from https://github.com/vitejs/vite/blob/9c114c5c72a6af87e3330d5573362554b4511265/packages/vite/src/node/server/middlewares/error.ts

import pc from '@brillout/picocolors'
import { assert, escapeRegex, getFilePathVite, isObject, stripAnsi } from '../../utils'

// Subset of RollupError
type FrameError = { id: string; frame: string; message: string; plugin?: string }

function isFrameError(err: unknown): err is FrameError {
  if (!isObject(err)) return false
  const { id, frame, message } = err
  return typeof frame === 'string' && typeof id === 'string' && typeof message === 'string'
}

function formatFrameError(err: FrameError, userRootDir: string): string {
  assert(isFrameError(err))
  let { id, frame } = err
  frame = frame.trim()
  assert(frame)

  const msgFirstLine = [
    pc.red('Failed to transpile'),
    pc.red(pc.bold(getFilePathVite(id, userRootDir))),
    pc.red('because:')
  ].join(' ')

  const errMsg = getErrMsg(err)

  const msg = [
    msgFirstLine,
    errMsg,
    // Many tools set 'error.frame' to something rubbish, for example:
    //  - @vitejs/plugin-vue
    //  - @vitejs/plugin-react-swc
    // Conditionally swallowing frame is a risky move but seems to work.
    containsCodeSnippet(errMsg) ? null : pc.yellow(frame)
  ]
    .filter(Boolean)
    .join('\n')
  return msg

  /* Showing the error layover didn't properly work last time we tried. But we don't really need it, do we?
  server.ws.send({
    type: 'error',
    err: prepareError(err)
  })
  */
}

function getErrMsg(err: FrameError): string {
  const { id, frame } = err
  let errMsg = err.message

  const trail = /(?:\:|)(?:\s|$)/
  // Remove redundant message: "Transform failed with 1 error:" (redundant since we already print an intro message)
  errMsg = errMsg.split(reg([/Transform failed with \d* error(?:s|)/, trail], 'gi')).join('')
  // Remove "/home/rom/code/vite-plugin-ssr/examples/react-full-v1/components/Counter.tsx:1:8:" (redundant since we already print the filename)
  const pos = /(?:\:\d+|)/
  errMsg = errMsg.split(reg([id, pos, pos, trail], 'gi')).join('')
  // Remove "ERROR:" (useless)
  errMsg = errMsg.split(reg(['ERROR:', trail])).join('')
  // Remove "Internal server error:" (useless)
  errMsg = errMsg.split(reg(['Internal server error', trail])).join('')

  if (containsCodeSnippet(errMsg)) {
    // Remove weird standalone code position " (2:7) "
    errMsg = errMsg
      .split('\n')
      .map((line) => {
        assert(/\(\d+:\d+\)/.test('(1:2)'))
        if (!isCodeSnippetLine(line)) {
          line = line.split(/\(\d+:\d+\)/).join('')
        }
        return line
      })
      .join('\n')
  }

  errMsg = errMsg.trim()
  if (frame.includes(errMsg)) errMsg = ''

  return errMsg
}

function containsCodeSnippet(str: string) {
  str = stripAnsi(str)
  let codeBlockSize = 0
  for (const line of str.split('\n')) {
    if (!isCodeSnippetLine(line)) {
      codeBlockSize = 0
    } else {
      codeBlockSize++
    }
    if (codeBlockSize >= 3) {
      return true
    }
  }
  return false
}

function isCodeSnippetLine(line: string): boolean {
  return /[\s\d>]*\|/.test(line)
}

function reg(parts: (RegExp | string)[], flags: string = '') {
  return new RegExp(parts.map((part) => (typeof part === 'string' ? escapeRegex(part) : part.source)).join(''), flags)
}
