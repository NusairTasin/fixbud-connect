import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhoneContact } from "./PhoneContact";

describe("PhoneContact", () => {
  it("renders a tel: link for a valid phone string", () => {
    render(<PhoneContact phone="+8801712345678" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "tel:+8801712345678");
    expect(link).toHaveTextContent("+8801712345678");
  });

  it("renders 'No phone provided' for null", () => {
    render(<PhoneContact phone={null} />);
    expect(screen.getByText("No phone provided")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders 'No phone provided' for empty string", () => {
    render(<PhoneContact phone="" />);
    expect(screen.getByText("No phone provided")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a Phone icon alongside the link", () => {
    render(<PhoneContact phone="01712345678" />);
    const link = screen.getByRole("link");
    // lucide-react renders an <svg> inside the anchor
    const svg = link.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
