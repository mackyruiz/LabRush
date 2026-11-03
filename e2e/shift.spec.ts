import { expect, test, type Page } from '@playwright/test';

async function enterLab(page: Page): Promise<void> {
  await page.getByRole('button', { name: /start shift/i }).click();
  await page.getByRole('button', { name: /clock in/i }).click();
  await expect(page.locator('.objective-text')).toContainText(/QC/i);
}

test('full shift through the debug API', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title-panel')).toBeVisible();
  await enterLab(page);

  await page.screenshot({ path: 'test-results/lab.png' });
  await page.evaluate(() => {
    window.__labrush!.engine.completeQc({ cleared: { CHEM: true, HEMA: true, COAG: true }, flagged: [] });
  });
  await expect(page.locator('.objective-text')).toContainText(/Receive/i);

  await page.evaluate(() => {
    const e = window.__labrush!.engine;
    e.receiveNextOrder();
    e.accession({
      decisions: [
        { specimenId: 'SPC-1001A', accepted: true },
        { specimenId: 'SPC-1001B', accepted: true },
      ],
      orderOfDraw: ['GOLD_SST', 'LAVENDER_EDTA'],
    });
    e.centrifuge('BMP', { balanced: true, rpm: 3000, minutes: 10, success: true });
    e.aliquot('BMP', { volumeUl: 500, attempts: 1, success: true });
    e.loadAnalyzer('CHEM');
    e.runAnalyzer('CHEM');
    e.loadAnalyzer('HEMA');
    e.runAnalyzer('HEMA');
  });

  const blocked = await page.evaluate(() => window.__labrush!.engine.releaseTest('BMP').reason ?? '');
  expect(blocked).toMatch(/critical/i);

  await page.evaluate(() => window.__labrush!.ui.openStation('report'));
  await expect(page.locator('.modal')).toBeVisible();
  await page.screenshot({ path: 'test-results/review.png' });
  await page.locator('.modal').getByRole('button', { name: /call provider/i }).click();
  await expect(page.locator('.modal').last()).toContainText(/Critical callback/i);
  await page.screenshot({ path: 'test-results/callback.png' });
  await page.evaluate(() => window.__labrush!.ui.closeAllModals());

  await page.evaluate(() => {
    const e = window.__labrush!.engine;
    e.reportCritical('BMP', 'K');
    e.releaseTest('BMP');
    e.releaseTest('CBC');
  });
  await page.evaluate(() => window.__labrush!.engine.closeOrder());
  await expect(page.locator('.objective-text')).toContainText(/Marcus Lee/i);

  await page.evaluate(() => {
    const e = window.__labrush!.engine;
    e.receiveNextOrder();
    e.accession({ decisions: [{ specimenId: 'SPC-1002A', accepted: true }] });
    e.centrifuge('PT_INR', { balanced: true, rpm: 3000, minutes: 15, success: true });
    e.aliquot('PT_INR', { volumeUl: 500, attempts: 1, success: true });
    e.loadAnalyzer('COAG');
    e.runAnalyzer('COAG');
  });
  const bothCritical = await page.evaluate(() => {
    const e = window.__labrush!.engine;
    const before = e.getSnapshot().activeOrder?.testStates[0].criticals ?? [];
    e.reportCritical('PT_INR', 'PT');
    e.reportCritical('PT_INR', 'INR');
    const after = e.getSnapshot().activeOrder?.testStates[0].criticalReported ?? [];
    return { before, after };
  });
  expect(bothCritical.before).toEqual(expect.arrayContaining(['PT', 'INR']));
  expect(bothCritical.after).toEqual(expect.arrayContaining(['PT', 'INR']));
  await page.evaluate(() => {
    const e = window.__labrush!.engine;
    e.releaseTest('PT_INR');
    e.closeOrder();
  });

  await page.evaluate(() => {
    const e = window.__labrush!.engine;
    e.receiveNextOrder();
    e.accession({
      decisions: [
        { specimenId: 'SPC-1003A', accepted: true },
        { specimenId: 'SPC-1003B', accepted: false, reason: 'label_mismatch' },
      ],
      orderOfDraw: ['GOLD_SST', 'LAVENDER_EDTA'],
    });
    e.loadAnalyzer('HEMA');
    e.runAnalyzer('HEMA');
    e.releaseTest('CBC');
    e.requestRecollect('BMP', 'label_mismatch');
    e.closeOrder();
  });

  await expect(page.locator('#scorecard')).toBeVisible();
  await expect(page.locator('#scorecard .grade')).toHaveText(/[ABCD]/);
  await expect(page.locator('#scorecard')).toContainText(/What you learned/);
  await page.screenshot({ path: 'test-results/scorecard.png' });

  const saved = await page.evaluate(() => localStorage.getItem('labrush.save.v1'));
  expect(saved).toContain('"best"');
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('labrush.save.v1') ?? '{}').best);
  expect(best.grade).toMatch(/[ABCD]/);
  expect(best.overall).toBeGreaterThanOrEqual(0);

  await page.goto('/');
  await expect(page.locator('.title-panel')).toBeVisible();
  await page.screenshot({ path: 'test-results/title-best.png' });
});
