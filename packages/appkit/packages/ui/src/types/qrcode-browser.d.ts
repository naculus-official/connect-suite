declare module 'qrcode/lib/browser.js' {
  import type QRCode from 'qrcode'

  const browserQRCode: typeof QRCode
  export = browserQRCode
}
