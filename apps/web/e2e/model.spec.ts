import { expect, test } from '@playwright/test';

test.describe('local model setup communication', () => {
  test('shows real progress and keeps status visible after settings closes', async ({ page }) => {
    await page.addInitScript(() => {
      const control = { releaseInstall: null as (() => void) | null };
      (window as Window & { __modelTestControl: typeof control }).__modelTestControl = control;

      class FakeWorker {
        private readonly listeners = new Set<(event: { data: unknown }) => void>();
        private terminated = false;
        addEventListener(type: string, listener: (event: { data: unknown }) => void) {
          if (type === 'message') this.listeners.add(listener);
        }
        removeEventListener(type: string, listener: (event: { data: unknown }) => void) {
          if (type === 'message') this.listeners.delete(listener);
        }
        terminate() { this.terminated = true; }
        postMessage(message: { type: string; operation?: string; requestId?: string }) {
          if (this.terminated || !message.requestId) return;
          if (message.type === 'configure') {
            this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'configure', result: { ok: true, value: undefined } });
            this.emit({ version: 1, type: 'state', state: 'uninstalled' });
            return;
          }
          if (message.type === 'cancel') return;
          if (message.operation === 'inspect-cache') {
            this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'inspect-cache', result: { ok: true, value: false } });
            return;
          }
          if (message.operation === 'install') {
            this.emit({ version: 1, type: 'progress', requestId: message.requestId, progress: { phase: 'downloading', progress: 0.37, text: 'Downloading model artifacts' } });
            control.releaseInstall = () => {
              this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'install', result: { ok: true, value: undefined } });
              this.emit({ version: 1, type: 'state', state: 'installed' });
            };
            return;
          }
          if (message.operation === 'load') {
            this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'load', result: { ok: true, value: undefined } });
            this.emit({ version: 1, type: 'state', state: 'loaded' });
            return;
          }
          this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: message.operation, result: { ok: true, value: undefined } });
        }
        private emit(data: unknown) {
          if (this.terminated) return;
          this.listeners.forEach((listener) => listener({ data }));
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: FakeWorker });
    });

    await page.goto('/');
    await page.locator('button[title="Model setup"]').click();
    await expect(page.getByRole('heading', { name: 'Model setup' })).toBeVisible();
    await expect(page.getByText('Local model not downloaded')).toBeVisible();

    await page.getByRole('button', { name: 'Download & load model' }).click();
    await expect(page.locator('.model-progress-block')).toContainText('downloading');
    await expect(page.locator('.model-progress-block')).toContainText('37%');

    await page.getByRole('button', { name: 'Close model setup' }).click();
    await expect(page.locator('.model-status-panel')).toContainText('downloading');
    await page.evaluate(() => (window as Window & { __modelTestControl: { releaseInstall: (() => void) | null } }).__modelTestControl.releaseInstall?.());
    await expect(page.locator('.model-status-panel')).toContainText('Local model ready');
  });
});
