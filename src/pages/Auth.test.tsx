import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Auth from "./Auth";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: null, role: null, loading: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Render Auth and switch to the signup tab using userEvent for full pointer simulation.
 */
async function renderAndSwitchToSignup() {
  const user = userEvent.setup();
  const result = render(<Auth />);
  await user.click(screen.getByRole("tab", { name: /create account/i }));
  return { ...result, user };
}

/**
 * Fill and submit the signup form.
 * Must be called after renderAndSwitchToSignup() so the signup content is rendered.
 */
async function fillAndSubmitSignupForm(
  user: ReturnType<typeof userEvent.setup>,
  {
    name = "Test User",
    email = "test@example.com",
    phone = "",
    password = "password123",
  }: {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
  } = {}
) {
  const nameInput = document.getElementById("signup-name") as HTMLInputElement;
  const emailInput = document.getElementById("signup-email") as HTMLInputElement;
  const phoneInput = document.getElementById("signup-phone") as HTMLInputElement;
  const passInput = document.getElementById("signup-pass") as HTMLInputElement;

  if (!nameInput || !emailInput || !phoneInput || !passInput) {
    throw new Error(
      "Signup form inputs not found — did you call renderAndSwitchToSignup() first?"
    );
  }

  await user.clear(nameInput);
  await user.type(nameInput, name);
  await user.clear(emailInput);
  await user.type(emailInput, email);
  await user.clear(phoneInput);
  if (phone) await user.type(phoneInput, phone);
  await user.clear(passInput);
  await user.type(passInput, password);

  const form = phoneInput.closest("form")!;
  fireEvent.submit(form);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Auth.tsx – phone field behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Requirement 1.1 / 6.1 – phone input only on signup tab
  it("signup tab renders phone input", async () => {
    await renderAndSwitchToSignup();
    expect(document.getElementById("signup-phone")).toBeInTheDocument();
  });

  // Requirement 6.1 / 6.2 – sign-in tab has no phone input
  it("sign-in tab does not render phone input", () => {
    render(<Auth />);
    // Default tab is sign-in; the signup content is not yet rendered
    const signinForm = document.getElementById("signin-email")!.closest("form")!;
    expect(signinForm.querySelector('input[type="tel"]')).toBeNull();
  });

  // Requirement 1.2 / 1.3 – empty phone shows required error
  it("submitting with empty phone shows 'Phone number is required'", async () => {
    const { user } = await renderAndSwitchToSignup();
    await fillAndSubmitSignupForm(user, { phone: "" });
    expect(await screen.findByText("Phone number is required")).toBeInTheDocument();
  });

  // Requirement 2.2 – invalid phone shows format error
  it("submitting with invalid phone shows the format error message", async () => {
    const { user } = await renderAndSwitchToSignup();
    await fillAndSubmitSignupForm(user, { phone: "12345" });
    expect(
      await screen.findByText(
        "Enter a valid Bangladeshi mobile number (e.g. 01712345678)"
      )
    ).toBeInTheDocument();
  });

  // Requirement 5.1 – duplicate phone Supabase error maps to user-facing message
  it("Supabase duplicate-phone error maps to the correct user-facing message", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { message: "phone already exists unique constraint", code: "23505" },
    });

    const { user } = await renderAndSwitchToSignup();
    await fillAndSubmitSignupForm(user, { phone: "01712345678" });

    expect(
      await screen.findByText(
        "This phone number is already registered. Please sign in or use a different number."
      )
    ).toBeInTheDocument();
  });
});
