import { test, expect } from "@playwright/test";
import { report, transport } from "./http-support";

test("旧mock偏好/本地报告被忽略，默认真实HTTP且设置没有模式开关", async ({ page }) => {
  await transport(page);
  await page.addInitScript(() => {
    localStorage.setItem("commerce-lens:mode", "mock");
    localStorage.setItem("commerce-lens:demo-reports:v1", '{"corrupt":"old"}');
  });
  await page.goto("/");
  await expect(page.locator(".mode-notice")).toContainText("真实 PostgreSQL");
  await expect(page.locator(".report")).toHaveCount(0);
  await page.getByRole("button", { name: "工作区与设置", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByLabel("演示场景", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("后端数据库");
});
test("服务不可用明确失败、不会显示固定报告；重新连接可恢复", async ({ page }) => {
  await transport(page);
  await page.route("**/api/catalog", (route) => route.fulfill({ status: 503, json: { code: "NOT_READY", message: "数据库未准备好", retryable: true, traceId: "offline" } }));
  await page.goto("/?page=workspace");
  await expect(page.getByRole("alert")).toContainText("数据库未准备好");
  await expect(page.locator(".report")).toHaveCount(0);
  await page.getByRole("textbox", { name: "输入分析问题" }).fill("昨天华东支付金额为什么下降？");
  await expect(page.getByRole("button", { name: "发送问题", exact: true })).toBeDisabled();
  await page.unroute("**/api/catalog");
  await page.getByRole("button", { name: "重新连接", exact: true }).click();
  await expect(page.getByRole("button", { name: "发送问题", exact: true })).toBeEnabled();
});
test("浏览器存储完全禁用仍可从后端恢复报告", async ({ page }) => {
  await transport(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("disabled", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("disabled", "SecurityError"); };
  });
  await page.goto(`/?report=${report.id}`);
  await expect(page.locator(".hero-number")).toContainText("70,000");
  await page.reload();
  await expect(page.locator(".hero-number")).toContainText("70,000");
});
test("中文输入法和Shift+Enter不误提交，连续Enter只发一次", async ({ page }) => {
  const state = await transport(page);
  await page.goto("/?page=workspace");
  const input = page.getByRole("textbox", { name: "输入分析问题" });
  await expect(page.getByRole("button", { name: "发送问题", exact: true })).toBeDisabled();
  await input.fill("昨天华东支付金额为什么下降？");
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  expect(state.starts).toBe(0);
  await input.dispatchEvent("compositionend");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue(/\n/);
  await input.evaluate((element) => { element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await expect.poll(() => state.starts).toBe(1);
  await expect(input).toBeDisabled();
});
test("明细、证据、Esc焦点和手机抽屉继续可用", async ({ page }) => {
  await transport(page);
  await page.goto(`/?report=${report.id}`);
  await page.getByRole("tab", { name: "明细", exact: true }).click();
  await expect(page.locator(".contribution-table")).toContainText("133.3%");
  const trigger = page.getByRole("button", { name: "查看证据 E02", exact: true }).first();
  await trigger.click();
  await expect(page.locator(".evidence-table")).toContainText("−¥40,000.00");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("partial报告在顶部展示原始预算错误，并保留已核验金额", async ({ page }) => {
  await transport(page);
  await page.route(`**/api/reports/${report.id}`, (route) => route.fulfill({ json: {
    ...report, status: "partial", limitations: [...report.limitations,
      "分析未完整完成 [BUDGET_EXCEEDED]：本地预算预检拒绝：剩余 token 不足，请求未发送"],
  } }));
  await page.goto(`/?report=${report.id}`);
  await expect(page.getByRole("status", { name: "分析未完整完成", exact: true })).toContainText("BUDGET_EXCEEDED");
  await expect(page.getByRole("status", { name: "分析未完整完成", exact: true })).toContainText("请求未发送");
  await expect(page.locator(".hero-number")).toContainText("70,000");
  await expect(page.locator(".completed-label")).toHaveText("部分成功");
  await page.screenshot({ path: "artifacts/agent-budget-optimization-20261023/partial-budget-banner.png", fullPage: true, animations: "disabled" });
});
