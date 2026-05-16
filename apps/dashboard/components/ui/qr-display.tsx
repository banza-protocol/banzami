'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const WINE = '#990011';
const DARK = '#1A1A1A';

interface Props {
  data: string;
  size?: number;
  label?: string;
  sublabel?: string;
  showDownload?: boolean;
  downloadName?: string;
  showCopy?: boolean;
  copyValue?: string;
}

export function QrDisplay({
  data,
  size = 260,
  label,
  sublabel,
  showDownload = true,
  downloadName = 'qr-banzami',
  showCopy = false,
  copyValue,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef        = useRef<InstanceType<typeof import('qr-code-styling')['default']> | null>(null);
  const [copied, setCopied] = useState(false);

  const buildQr = useCallback(async () => {
    const { default: QRCodeStyling } = await import('qr-code-styling');
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const qr = new QRCodeStyling({
      width:  size,
      height: size,
      data,
      image:  '/banzami-icon.png',
      qrOptions:             { errorCorrectionLevel: 'H' },
      dotsOptions:           { color: DARK,  type: 'square' },
      cornersSquareOptions:  { color: WINE,  type: 'square' },
      cornersDotOptions:     { color: WINE },
      backgroundOptions:     { color: '#ffffff' },
      imageOptions:          { crossOrigin: 'anonymous', margin: 5, imageSize: 0.22 },
    });

    qr.append(containerRef.current);
    qrRef.current = qr;
  }, [data, size]);

  useEffect(() => { buildQr(); }, [buildQr]);

  function handleDownload() {
    qrRef.current?.download({ name: downloadName, extension: 'png' });
  }

  function handleCopy() {
    navigator.clipboard.writeText(copyValue ?? data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center gap-lg">
      <div className="bg-white rounded-xl shadow-card p-xl border border-gray-100">
        <div ref={containerRef} style={{ width: size, height: size }} />
      </div>

      {label && (
        <p className="text-lg font-bold text-gray-900 font-mono tabular-nums">{label}</p>
      )}
      {sublabel && (
        <p className="text-sm text-gray-400">{sublabel}</p>
      )}

      <div className="flex gap-sm">
        {showCopy && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-sm h-9 px-lg bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark transition-colors"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copiado' : 'Copiar link'}
          </button>
        )}
        {showDownload && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-sm h-9 px-lg border border-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            <Download size={15} />
            Baixar QR
          </button>
        )}
      </div>
    </div>
  );
}
