import { test, expect } from '@playwright/test';

const viewports = [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 }, // iPhone 12/13/14
];

for (const vp of viewports) {
  test(`нет горизонтального скролла при ${vp.width}x${vp.height}`, async ({ page, context }) => {
    await page.setViewportSize(vp);
    await page.goto('/');

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = (await page.viewportSize())!.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
  });
}


