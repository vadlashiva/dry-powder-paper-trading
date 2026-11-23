// @ts-nocheck
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductToggle } from "./App";

test("stock ticket offers Intraday and Delivery and reports the choice", () => {
  const onChange = jest.fn();
  render(<ProductToggle product="CF" onChange={onChange} kind="stock" />);
  expect(screen.getByRole("radio", { name: /Delivery/ })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/shares stay until you sell/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /Intraday/ }));
  expect(onChange).toHaveBeenCalledWith("MIS");
});

test("option ticket says Carry-forward (NRML) and explains square-off for intraday", () => {
  render(<ProductToggle product="MIS" onChange={() => {}} kind="option" />);
  expect(screen.getByRole("radio", { name: /Carry-forward/ })).toBeInTheDocument();
  expect(screen.getByText(/squared off automatically at 3:20 PM/)).toBeInTheDocument();
});
