// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeFileUploadDto } from '@surefy/contracts'

/** Hex SHA-256 of a file, computed in the browser and sent with the upload request (duplicate check). */
export function sha256Hex(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      globalThis.crypto.subtle
        .digest('SHA-256', reader.result as ArrayBuffer)
        .then((digest) => {
          resolve(
            Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
              '',
            ),
          )
        })
        .catch(reject)
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('The file could not be read'))
    })
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Sends the bytes to the signed storage URL of a file source and reports progress (0–100). It
 * rejects when storage does not accept the file; the caller then removes the source and offers Retry.
 */
export function uploadToStorage(
  upload: KnowledgeFileUploadDto['upload'],
  file: Blob,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(upload.method, upload.url)
    for (const [name, value] of Object.entries(upload.headers))
      request.setRequestHeader(name, value)
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(`Upload failed with status ${request.status}`))
    })
    request.addEventListener('error', () => {
      reject(new Error('Upload failed'))
    })
    request.send(file)
  })
}
