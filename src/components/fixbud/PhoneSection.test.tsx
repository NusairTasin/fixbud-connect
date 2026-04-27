import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PhoneSection } from "./PhoneSection";
import { vi } from "vitest";

let phoneMockValue: string | null = "+8801712345678";

function makeSupabaseMock() {
  return {
    from: vi.fn(function (table: string) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function (_, val) {
          return this;
        }),
        maybeSingle: vi.fn(() => Promise.resolve({ data: { phone: phoneMockValue }, error: null })),
        update: vi.fn(function (value) {
          // handle normalization on "Save"
          if (value && value.phone) phoneMockValue = value.phone;
          return {
            eq: vi.fn(() => Promise.resolve({ error: null })),
          };
        }),
      };
    }),
  };
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: makeSupabaseMock() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// --- Tests ---
describe("PhoneSection", () => {
  beforeEach(() => {
    phoneMockValue = "01712345678";
  });
  afterEach(() => vi.clearAllMocks());

  it("renders the current phone for the user", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByText("Mobile phone")).toBeInTheDocument());
    expect(screen.getByText("01712345678")).toBeInTheDocument();
  });

  it("shows placeholder when phone is null", async () => {
    const mod = await import("@/integrations/supabase/client");
    mod.supabase.from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: { phone: null }, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByText("Mobile phone")).toBeInTheDocument());
    expect(screen.getByText(/No phone number set/)).toBeInTheDocument();
  });

   it("clicking Edit enters edit mode with input pre-filled", async () => {
    phoneMockValue = "01712345678"; // Ensure state
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByText("01712345678")).toBeInTheDocument()); // ensure phone has loaded
    fireEvent.click(screen.getByText("Edit"));
    const input = await screen.findByTestId("phone-input");
    expect(input).toHaveValue("01712345678"); // It should match mock DB value before normalization
  });

  it("shows error for invalid phone and blocks save", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByTestId("phone-input");
    fireEvent.change(input, { target: { value: "01799" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByTestId("inline-error")).toHaveTextContent("Invalid Bangladeshi phone number."));
  });

  it("successful save updates phone and exits edit mode", async () => {
    render(<PhoneSection userId="user-123" />);
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByTestId("phone-input");
    fireEvent.change(input, { target: { value: "01712345678" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("+8801712345678")).toBeInTheDocument());
  });
});
