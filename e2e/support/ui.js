const { expect } = require("@playwright/test");
const { createCustomer, promoteToAdmin } = require("./api");

/**
 * Signs a fresh verified customer in through the real sign-in form.
 * Registration and email verification go through the API (the form flow for those is not what
 * these tests are about); the login itself is done in the browser so the app establishes its own
 * session cookie exactly as a real shopper would.
 */
const signInAsNewCustomer = async (page, label) => {
  const account = await createCustomer(label);
  await submitSignIn(page, account);
  return account;
};

/**
 * Submits the sign-in form, waiting out AuthRateLimitFilter if the suite has tripped it.
 * The login limit is 20/minute per IP and every worker is 127.0.0.1, so a long run legitimately
 * hits it. Waiting is the right answer — the alternative is weakening a real security control.
 */
const submitSignIn = async (page, account, { attempts = 2, admin = false } = {}) => {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/signin");
    await page.getByPlaceholder("you@example.com").fill(account.email);
    await page.getByPlaceholder("Enter your password").first().fill(account.password);
    await page.locator(".signin-submit").click();
    try {
      // Each role has its own signal that the session is live. An admin lands on the admin shell,
      // which has no storefront navbar, so .nav-user would never appear for one.
      if (admin) await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
      else await expect(page.locator(".nav-user")).toBeVisible({ timeout: 20_000 });
      return;
    } catch (error) {
      const body = await page.locator("body").innerText().catch(() => "");
      const rateLimited = /too many|try again later|rate limit/i.test(body);
      if (!rateLimited || attempt >= attempts) throw error;
      await page.waitForTimeout(61_000);
    }
  }
};

/** Fills the checkout's new-address form, leaving pincode to the caller. */
const fillCheckoutAddress = async (page, { pincode, country = "India" } = {}) => {
  await page.getByPlaceholder("Recipient name").fill("E2E Buyer");
  await page.getByPlaceholder("Phone number").fill("9876543210");
  await page.getByPlaceholder("Street address").fill("1 Test Street");
  await page.getByPlaceholder("City").fill("Bengaluru");
  await page.getByPlaceholder("State").fill("Karnataka");
  await page.getByPlaceholder("Country").fill(country);
  if (pincode !== undefined) await page.getByLabel("PIN code").fill(pincode);
};

/**
 * Creates an admin, promotes it and signs it in through the real form.
 *
 * Four specs had inlined this sequence, and every copy went straight to the form instead of going
 * through submitSignIn — so none of them had the rate-limit backoff, which is the entire reason
 * this module exists. One definition, one place for that behaviour.
 */
const signInAsNewAdmin = async (page, label) => {
  const account = await createCustomer(label);
  promoteToAdmin(account.userId);
  // Landing on /admin is itself the proof the promotion took effect.
  await submitSignIn(page, account, { admin: true });
  return account;
};

module.exports = { fillCheckoutAddress, signInAsNewAdmin, signInAsNewCustomer, submitSignIn };
