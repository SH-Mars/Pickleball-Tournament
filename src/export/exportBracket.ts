import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Tournament } from '../domain/types';
import { BracketSvg, bracketSize } from './BracketSvg';

export function bracketSvgString(t: Tournament, showSeed: boolean): { svg: string; width: number; height: number } {
  const { width, height } = bracketSize(t, true);
  const svg = renderToStaticMarkup(createElement(BracketSvg, { tournament: t, header: { showSeed } }));
  return { svg, width, height };
}

export async function bracketToPng(t: Tournament, showSeed: boolean, scale = 2): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const { svg, width, height } = bracketSvgString(t, showSeed);
  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The bracket image could not be drawn.'));
  });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await loaded;
  const maxDim = 8000;
  const s = Math.min(scale, maxDim / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * s);
  canvas.height = Math.round(height * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot create images here.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image export failed.'))), 'image/png'));
  return { blob, dataUrl: canvas.toDataURL('image/png'), width, height };
}

export async function bracketToPdf(t: Tournament, showSeed: boolean): Promise<Blob> {
  const { dataUrl, width, height } = await bracketToPng(t, showSeed, 2);
  const { jsPDF } = await import('jspdf');
  // Small brackets fit a landscape Letter page; big ones get a page sized to the bracket so text stays readable.
  const small = t.teams.length <= 8;
  const pageW = small ? 792 : Math.max(792, width * 0.75 + 48);
  const pageH = small ? 612 : Math.max(612, height * 0.75 + 48);
  const doc = new jsPDF({ orientation: pageW >= pageH ? 'landscape' : 'portrait', unit: 'pt', format: [pageW, pageH] });
  const margin = 24;
  const k = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
  const w = width * k;
  const h = height * k;
  doc.addImage(dataUrl, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h, undefined, 'FAST');
  doc.setProperties({ title: t.name });
  return doc.output('blob');
}
