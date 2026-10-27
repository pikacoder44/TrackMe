import { test, expect } from '@playwright/test'

test.describe('Authentication & Dashboard Access Flow', () => {
  test('login page renders form elements accurately', async ({ page }) => {
    await page.goto('/login')

    // Verify page header
    await expect(page.getByRole('heading', { name: /sign in to trackme/i })).toBeVisible()
    await expect(page.getByText(/enter your credentials to access your dashboard/i)).toBeVisible()

    // Verify form inputs
    const emailInput = page.getByLabel(/email/i)
    const passwordInput = page.getByLabel(/password/i)
    const submitButton = page.getByRole('button', { name: /sign in/i })

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(submitButton).toBeVisible()

    // Verify link to signup
    const signupLink = page.getByRole('link', { name: /sign up/i })
    await expect(signupLink).toBeVisible()
  })

  test('validates required fields on empty submit', async ({ page }) => {
    await page.goto('/login')

    const emailInput = page.getByLabel(/email/i)
    const passwordInput = page.getByLabel(/password/i)

    // Verify native HTML5 form validation attributes
    await expect(emailInput).toHaveAttribute('required', '')
    await expect(passwordInput).toHaveAttribute('required', '')
    await expect(emailInput).toHaveAttribute('type', 'email')
  })

  test('unauthenticated users accessing protected dashboard are redirected', async ({ page }) => {
    // Attempting to visit /dashboard directly without session should redirect to /login
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
