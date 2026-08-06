const { expect } = require("@playwright/test");
const { createCustomer } = require("./api");

/**
 * Signs a fresh verified customer in through the real sign-in form.
 * Registration and email verification go through the API (the form flow for those is not what
 * these tests are about); the login itself is done in the browser so the app establishes its own
 * session cookie exactly as a real shopper would.
 */
const signInAsNewCustomer = async (page, label) => {
  const account = await createCustomer(label);
  await page.goto("/signin");
  await page.getByPlaceholder("you@example.com").fill(account.email);
  await page.getByPlaceholder("Enter your password").first().fill(account.password);
  await page.locator(".signin-submit").click();
  // The header greeting is the app's own signal that the session is live.
  await expect(page.locator(".nav-user")).toBeVisible({ timeout: 20_000 });
  return account;
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

module.exports = { fillCheckoutAddress, signInAsNewCustomer };
