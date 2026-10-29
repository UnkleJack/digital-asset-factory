import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { Semaphore } from '../../core/semaphore.ts';
import { AppError, transient } from '../../core/errors.ts';
import type { Logger } from '../../logging/logger.ts';

export interface RenderDiagnostics {
  pageCount: number;
  overflow: { page: number; tag: string; cls: string; text: string; overflowPx: number }[];
  outsideMargin: { page: number; tag: string; cls: string; text: string; byPx: number }[];
  fontsFailed: string[];
  fontsMissing: string[];
  blockedRequests: string[];
  consoleErrors: string[];
}

export interface RenderedDocument {
  pdf: Buffer;
  pdfPageCount: number;
  pdfPageSizesPt: { w: number; h: number }[];
  previews: Buffer[];
  diagnostics: RenderDiagnostics;
  chromeVersion: string;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  darkRatio: number;
  lightRatio: number;
  midtoneRatio: number;
  colorfulRatio: number;
}

const PROBE = (requiredFamilies: string[]) => {
  const out = { overflow: [] as unknown[], outsideMargin: [] as unknown[], fontsFailed: [] as string[], fontsMissing: [] as string[], pageCount: 0 };
  const pages = Array.from(document.querySelectorAll('.page')) as HTMLElement[];
  out.pageCount = pages.length;
  const clsOf = (el: Element) => {
    const c = (el as HTMLElement).className as unknown;
    return typeof c === 'string' ? c : ((c as { baseVal?: string })?.baseVal ?? '');
  };
  pages.forEach((p, idx) => {
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const safe = {
      l: r.left + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.paddingRight),
      t: r.top + parseFloat(cs.paddingTop), b: r.bottom - parseFloat(cs.paddingBottom),
    };
    if (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2) {
      out.overflow.push({ page: idx, tag: 'PAGE', cls: 'page', text: '', overflowPx: Math.max(p.scrollHeight - p.clientHeight, p.scrollWidth - p.clientWidth) });
    }
    p.querySelectorAll('*').forEach((el) => {
      if (el.closest('[data-allow-bleed]')) return;
      const er = el.getBoundingClientRect();
      if (er.width === 0 || er.height === 0) return;
      const by = Math.max(safe.l - er.left, er.right - safe.r, safe.t - er.top, er.bottom - safe.b);
      if (by > 1.5 && out.outsideMargin.length < 60) {
        out.outsideMargin.push({ page: idx, tag: el.tagName, cls: clsOf(el), text: (el.textContent || '').trim().slice(0, 60), byPx: Math.round(by) });
      }
      const ecs = getComputedStyle(el);
      if (el instanceof HTMLElement && ecs.overflow !== 'visible' && el.clientHeight > 0 && el.textContent && el.textContent.trim()) {
        const o = Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth);
        if (o > 1 && out.overflow.length < 60) out.overflow.push({ page: idx, tag: el.tagName, cls: clsOf(el), text: el.textContent.trim().slice(0, 60), overflowPx: o });
      }
    });
  });
  const faces = Array.from((document as unknown as { fonts: Iterable<FontFace> }).fonts);
  for (const f of faces) if (f.status === 'error') out.fontsFailed.push(`${f.family} ${f.weight} ${f.style}`);
  for (const fam of requiredFamilies) {
    const loaded = faces.some((f) => f.family.replace(/['"]/g, '') === fam && f.status === 'loaded');
    if (!loaded) out.fontsMissing.push(fam);
  }
  return out;
};

function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(transient(`Rendering step "${step}" timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

export class Renderer {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private sem: Semaphore;
  private chromePath: string;
  private timeoutMs: number;
  private log: Logger;

  constructor(opts: { chromePath: string; concurrency: number; timeoutMs: number; log: Logger }) {
    this.chromePath = opts.chromePath;
    this.sem = new Semaphore(opts.concurrency);
    this.timeoutMs = opts.timeoutMs;
    this.log = opts.log;
  }

  available(): boolean {
    return existsSync(this.chromePath);
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.launching) return this.launching;
    if (!this.available()) {
      throw new AppError('chrome_not_found', `Google Chrome or Microsoft Edge was not found at "${this.chromePath}". Install Chrome, or set Settings → Rendering → Chrome path.`, { httpStatus: 424 });
    }
    this.launching = puppeteer
      .launch({
        executablePath: this.chromePath,
        headless: true,
        // The app owns signal handling; puppeteer's handlers would exit(130) before graceful shutdown finishes.
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        // Talk to Chrome over a pipe so it exits with us even after a hard kill, instead of lingering.
        pipe: true,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--hide-scrollbars', '--mute-audio', '--disable-component-update'],
      })
      .then((b) => {
        this.browser = b;
        b.on('disconnected', () => {
          this.browser = null;
        });
        return b;
      })
      .finally(() => {
        this.launching = null;
      });
    return this.launching;
  }

  async version(): Promise<string> {
    return (await this.getBrowser()).version();
  }

  private async withPage<T>(fn: (page: Page, blocked: string[], consoleErrors: string[]) => Promise<T>): Promise<T> {
    return this.sem.use(async () => {
      let page: Page | null = null;
      try {
        const browser = await this.getBrowser();
        page = await browser.newPage();
        page.setDefaultTimeout(this.timeoutMs);
        await page.setJavaScriptEnabled(true);
        const blocked: string[] = [];
        const consoleErrors: string[] = [];
        await page.setOfflineMode(true);
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text();
          if (/Executing inline script violates/i.test(text)) return;
          if (/Refused to load|Content Security Policy|ERR_INTERNET_DISCONNECTED/i.test(text)) blocked.push(text.slice(0, 200));
          else consoleErrors.push(text.slice(0, 300));
        });
        page.on('requestfailed', (req) => {
          if (!req.url().startsWith('data:')) blocked.push(req.url().slice(0, 200));
        });
        page.on('pageerror', (err) => consoleErrors.push(String((err as Error)?.message ?? err).slice(0, 300)));
        return await fn(page, blocked, consoleErrors);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw transient(`Rendering failed: ${(err as Error).message}`, err);
      } finally {
        if (page) await page.close().catch(() => undefined);
      }
    });
  }

  async renderDocument(opts: { html: string; widthMm: number; heightMm: number; previewPages: number; previewDpi: number; requiredFamilies: string[] }): Promise<RenderedDocument> {
    return this.withPage(async (page, blocked, consoleErrors) => {
      const pxW = Math.ceil((opts.widthMm / 25.4) * 96);
      const pxH = Math.ceil((opts.heightMm / 25.4) * 96);
      const step = <T>(name: string, p: Promise<T>) => {
        this.log.debug('render step', { step: name });
        return withTimeout(p, this.timeoutMs, name);
      };
      await step('viewport', page.setViewport({ width: pxW, height: pxH, deviceScaleFactor: opts.previewDpi / 96 }));
      await step('setContent', page.setContent(opts.html, { waitUntil: 'load', timeout: this.timeoutMs }));
      await step('fonts', page.evaluate(async (fams: string[]) => {
        const fonts = (document as unknown as { fonts: { load(s: string): Promise<unknown>; ready: Promise<unknown> } }).fonts;
        await Promise.all(fams.map((f) => fonts.load(`400 12px "${f}"`).catch(() => undefined)));
        await fonts.ready;
      }, opts.requiredFamilies));
      await step('rules', page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--rule)';
        document.body.appendChild(probe);
        const rulePx = probe.getBoundingClientRect().height || 26;
        probe.remove();
        document.querySelectorAll('.ruled').forEach((el) => {
          const count = Math.max(1, Math.floor((el as HTMLElement).clientHeight / rulePx));
          el.replaceChildren(...Array.from({ length: count }, () => document.createElement('div')));
        });
      }));
      const probe = (await step('probe', page.evaluate(PROBE, opts.requiredFamilies))) as Omit<RenderDiagnostics, 'blockedRequests' | 'consoleErrors'>;
      const previews: Buffer[] = [];
      const handles = await step('handles', page.$$('.page'));
      for (const [i, h] of handles.slice(0, opts.previewPages).entries()) {
        previews.push(Buffer.from(await step(`screenshot-${i}`, h.screenshot({ type: 'png' }))));
      }
      const pdf = Buffer.from(
        await step('pdf', page.pdf({ width: `${opts.widthMm}mm`, height: `${opts.heightMm}mm`, printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, timeout: this.timeoutMs })),
      );
      const doc = await step('pdf-parse', PDFDocument.load(pdf));
      const sizes = doc.getPages().map((p) => {
        const s = p.getSize();
        return { w: Math.round(s.width * 100) / 100, h: Math.round(s.height * 100) / 100 };
      });
      return {
        pdf,
        pdfPageCount: doc.getPageCount(),
        pdfPageSizesPt: sizes,
        previews,
        diagnostics: { ...probe, blockedRequests: blocked, consoleErrors },
        chromeVersion: await page.browser().version(),
      };
    });
  }

  async screenshotHtml(html: string, widthPx: number, heightPx: number): Promise<Buffer> {
    return this.withPage(async (page) => {
      await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'load', timeout: this.timeoutMs });
      await page.evaluate(async () => {
        await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
      });
      return Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: widthPx, height: heightPx } }));
    });
  }

  async analyzePng(png: Buffer): Promise<ImageAnalysis> {
    return this.withPage(async (page) => {
      await page.setContent('<!doctype html><html><body></body></html>');
      return page.evaluate(async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const max = 800;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let dark = 0, light = 0, mid = 0, colorful = 0;
        const total = w * h;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], bl = d[i + 2];
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
          if (y < 90) dark++;
          else if (y > 200) light++;
          else mid++;
          if (Math.max(r, g, bl) - Math.min(r, g, bl) > 60) colorful++;
        }
        return { width: img.naturalWidth, height: img.naturalHeight, darkRatio: dark / total, lightRatio: light / total, midtoneRatio: mid / total, colorfulRatio: colorful / total };
      }, png.toString('base64'));
    });
  }

  async close(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b) await b.close().catch((err) => this.log.warn('Chrome close failed', { err }));
  }
}
