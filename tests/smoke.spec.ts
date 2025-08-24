import { test, expect } from '@playwright/test';

test('смоук: добавление сотрудника и задачи, распределение', async ({ page }) => {
  await page.goto('/');

  // Очистить предыдущее состояние, чтобы список был пустым
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Сбросить' }).click();

  // Проверка заголовка
  await expect(page.getByRole('heading', { name: 'Работа не волк' })).toBeVisible();

  // Добавить сотрудника
  await page.locator('#employee-name').fill('Анна');
  await page.locator('#employee-form button[type="submit"]').click();
  await expect(page.locator('#employee-list li')).toHaveCount(1);
  await expect(page.locator('#employee-list li')).toContainText('Анна');

  // Добавить задачу
  await page.locator('#task-title').fill('Отчет по продажам');
  await page.locator('#task-difficulty').evaluate((el: HTMLInputElement) => (el.value = '7'));
  await page.locator('#task-form button[type="submit"]').click();
  await expect(page.locator('#task-list li')).toHaveCount(1);

  // Распределить
  await page.getByRole('button', { name: 'Распределить' }).click();
  await expect(page.locator('#result .result-col')).not.toHaveCount(0);
  await expect(page.locator('#result .result-col .task-card')).not.toHaveCount(0);
  await expect(page.locator('#result .result-col .task-card')).toContainText('Отчет по продажам');

  // Скриншот отключён, чтобы не требовать базовых снапшотов
});


