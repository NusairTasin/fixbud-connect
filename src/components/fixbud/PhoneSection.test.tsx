import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PhoneSection } from "./PhoneSection";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// vi.mock is hoisted, so the mock object must also be hoisted via vi.hoisted
// to be accessible inside the factory function.
const { phoneMockRef, supabaseMock } = vi.hoisted(() => {
  const phoneMockRef = { value: "01712345678" as string | null };

  const supabaseMock = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: { phone: phoneMockRef.value }, error: null }),
      ),
      update: vi.fn((value) => {
        if (value?.phone) phoneMockRef.value = value.phone;
        return { eq: vi.fn(() => Promise.resolve({ error: null })) };
      }),
    })),
  };

  return { phoneMockRef, supabaseMock };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PhoneSection", () => {
  beforeEach(() => {
    phoneMockRef.value = "01712345678";
    vi.clearAllMocks();
  });

  afterEach(() => vi.clearAllMocks());

  it("renders the current phone for the user", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() =>
      expect(screen.getByText("01712345678")).toBeInTheDocument(),
    );
  });

  it("shows placeholder when phone is null", async () => {
    phoneMockRef.value = null;
    render(<PhoneSection userId="user-123" />);
    await waitFor(() =>
      expect(screen.getByText(/No phone number set/)).toBeInTheDocument(),
    );
  });

  it("clicking Edit enters edit mode with input pre-filled", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() =>
      expect(screen.getByText("01712345678")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText("Edit phone"));
    const input = await screen.findByTestId("phone-input");
    expect(input).toHaveValue("01712345678");
  });

  it("shows error for invalid phone and blocks save", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByLabelText("Edit phone")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit phone"));
    const input = screen.getByTestId("phone-input");
    fireEvent.change(input, { target: { value: "01799" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(screen.getByTestId("inline-error")).toHaveTextContent(
        "Invalid Bangladeshi phone number.",
      ),
    );
  });

  it("successful save updates phone and exits edit mode", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByLabelText("Edit phone")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit phone"));
    const input = screen.getByTestId("phone-input");
    fireEvent.change(input, { target: { value: "01712345678" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(screen.getByText("+8801712345678")).toBeInTheDocument(),
    );
  });
});
