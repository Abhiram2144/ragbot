/**
 * Captures processing and complete card states by mocking the /documents/{id}
 * polling endpoint — simulates what the UI looks like when Celery drives status.
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import { mkdirSync, writeFileSync } from 'fs';

const OUT = path.join(os.tmpdir(), 'ragbot_dashboard_screenshots');
mkdirSync(OUT, { recursive: true });

const ss = (name) => path.join(OUT, name);

const DOC1_ID = 'ed629d58-fa56-4e90-9349-d6c62af769b7';
const DOC2_ID = '0ec99024-f2eb-45b2-b26a-558acb5a2cfa';

// We'll log in with the existing test account that was created during verify_dashboard run
// But we don't know the email — so we'll sign up a new one and use route mocking
// to simulate the KB + document data and status progression.

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// ── Phase 1: Capture "processing" state with chunk bars ─────────────────────

// Mock login
await page.route('**/auth/login', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ access_token: 'mock.jwt.token' }),
}));

// Mock KB list
await page.route('**/knowledge-bases', route => {
  if (route.request().method() === 'GET') {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { id: 'kb1', name: 'Product Docs', description: 'Main documentation', created_at: '2026-07-27T10:00:00Z', updated_at: '2026-07-27T10:00:00Z' },
        { id: 'kb2', name: 'Engineering Specs', description: null, created_at: '2026-07-27T10:05:00Z', updated_at: '2026-07-27T10:05:00Z' },
      ]),
    });
  }
  return route.continue();
});

// Mock documents for kb1 — one processing, one pending
await page.route('**/knowledge-bases/kb1/documents', route => {
  if (route.request().method() === 'GET') {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { id: 'doc1', kb_id: 'kb1', filename: 'architecture-guide.pdf', status: 'processing', error_message: null, created_at: '2026-07-27T10:01:00Z', updated_at: '2026-07-27T10:01:30Z' },
        { id: 'doc2', kb_id: 'kb1', filename: 'api-reference.txt', status: 'pending', error_message: null, created_at: '2026-07-27T10:02:00Z', updated_at: '2026-07-27T10:02:00Z' },
      ]),
    });
  }
  return route.continue();
});

// Mock documents for kb2 — empty
await page.route('**/knowledge-bases/kb2/documents', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
);

// Track poll call count for doc1 so we can progress status
let pollCount = 0;
await page.route('**/knowledge-bases/kb1/documents/doc1', route => {
  pollCount++;
  const status = pollCount <= 2 ? 'processing' : 'complete';
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'doc1', kb_id: 'kb1', filename: 'architecture-guide.pdf', status, error_message: null, created_at: '2026-07-27T10:01:00Z', updated_at: '2026-07-27T10:01:30Z' }),
  });
});

// doc2 stays pending for a while then becomes processing
let doc2Poll = 0;
await page.route('**/knowledge-bases/kb1/documents/doc2', route => {
  doc2Poll++;
  const status = doc2Poll <= 1 ? 'pending' : 'processing';
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'doc2', kb_id: 'kb1', filename: 'api-reference.txt', status, error_message: null, created_at: '2026-07-27T10:02:00Z', updated_at: '2026-07-27T10:02:00Z' }),
  });
});

// Navigate and log in
await page.goto('http://localhost:5173/login');
await page.waitForLoadState('networkidle');
await page.fill('#email', 'mock@test.com');
await page.fill('#password', 'mockpassword');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 5000 });
await page.waitForTimeout(800); // let KB list and docs load

// Screenshot: one processing (chunk bars) + one pending
await page.screenshot({ path: ss('12_processing_chunk_bars.png') });
const badges1 = await page.$$eval('span.rounded-full', els => els.map(e => e.textContent?.trim()));
console.log(`[A] Mixed states: ${JSON.stringify(badges1)}`);

// Check chunk bars are in the DOM
const bars = await page.$$('.h-0\\.5.rounded-full');
console.log(`[A] Chunk bar elements: ${bars.length} (expect 5)`);

// Wait 4s for polling to flip doc1 to complete
await page.waitForTimeout(5000);
await page.screenshot({ path: ss('13_one_complete_one_processing.png') });
const badges2 = await page.$$eval('span.rounded-full', els => els.map(e => e.textContent?.trim()));
console.log(`[B] After first poll cycle: ${JSON.stringify(badges2)}`);

// Check checkmark rendered
const checkmark = await page.$('.check-pop');
console.log(`[B] Checkmark element present: ${!!checkmark}`);

// Wait more — doc1 stays complete, doc2 moves to processing
await page.waitForTimeout(4000);
await page.screenshot({ path: ss('14_mixed_complete_processing.png') });
const badges3 = await page.$$eval('span.rounded-full', els => els.map(e => e.textContent?.trim()));
console.log(`[C] Final state: ${JSON.stringify(badges3)}`);

// ── Phase 2: Test "failed" card state ────────────────────────────────────────
await page.unrouteAll();

await page.route('**/auth/login', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ access_token: 'mock.jwt.token' }),
}));
await page.route('**/knowledge-bases', route => route.request().method() === 'GET'
  ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'kb1', name: 'Product Docs', description: null, created_at: '2026-07-27T10:00:00Z', updated_at: '2026-07-27T10:00:00Z' },
    ]) })
  : route.continue()
);
await page.route('**/knowledge-bases/kb1/documents', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify([
    { id: 'doc3', kb_id: 'kb1', filename: 'corrupted-file.pdf', status: 'failed', error_message: 'Failed to extract text from PDF: the file appears to be corrupted or password-protected. Please check the file and re-upload.', created_at: '2026-07-27T10:03:00Z', updated_at: '2026-07-27T10:03:10Z' },
    { id: 'doc1', kb_id: 'kb1', filename: 'architecture-guide.pdf', status: 'complete', error_message: null, created_at: '2026-07-27T10:01:00Z', updated_at: '2026-07-27T10:01:30Z' },
  ]),
}));

await page.goto('http://localhost:5173/login');
await page.fill('#email', 'mock@test.com');
await page.fill('#password', 'mockpassword');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 5000 });
await page.waitForTimeout(800);
await page.screenshot({ path: ss('15_failed_and_complete.png') });
const badges4 = await page.$$eval('span.rounded-full', els => els.map(e => e.textContent?.trim()));
console.log(`[D] Failed + complete: ${JSON.stringify(badges4)}`);

// Expand the error message
const showMoreBtn = await page.$('button:has-text("show more")');
if (showMoreBtn) {
  await showMoreBtn.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: ss('16_failed_error_expanded.png') });
  console.log('[D] Expanded error message');
}

await browser.close();
console.log(`\nAll screenshots → ${OUT}`);
