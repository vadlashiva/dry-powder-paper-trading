// @ts-nocheck
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrokerSetup } from "./brokerSetup";

jest.mock("./growth", () => ({ track: jest.fn(() => Promise.resolve()) }));
const angel = { id: "angel", name: "Angel One", site: "https://smartapi.angelone.in/", needsSecret: false, keyLabel: "SmartAPI key", api: {} };
const setup = (props = {}) => render(<BrokerSetup brokers={{ angel }} broker={angel} hasKey={false} error="" onChoose={() => {}} onConnect={jest.fn()} onReconnect={() => {}} onForget={() => {}} onPreview={jest.fn()} brand={null} {...props} />);

beforeEach(() => localStorage.clear());

test("Next stays locked on step 1 until the API site is opened", () => {
  setup();
  const next = screen.getByRole("button", { name: "Next" });
  expect(next).toBeDisabled();
  fireEvent.click(screen.getByText("Open Angel One API site"));
  expect(next).not.toBeDisabled();
});

test("'Already logged in' also unlocks Next", () => {
  setup();
  fireEvent.click(screen.getByText("I'm already logged in there"));
  expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
});

test("the step is remembered after leaving the page", () => {
  const { unmount } = setup();
  fireEvent.click(screen.getByText("Open Angel One API site"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  unmount();
  setup();
  expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
});

test("step 4: Connect is disabled and help shows until a key is pasted", () => {
  localStorage.setItem("pr_setup_step_angel", "4");
  localStorage.setItem("pr_setup_site_angel", "1");
  const onConnect = jest.fn();
  setup({ onConnect });
  const connect = screen.getByRole("button", { name: "Connect Angel One" });
  expect(connect).toBeDisabled();
  expect(screen.getByText("No key yet?")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("SmartAPI key"), { target: { value: "  aB3dEf9h " } });
  expect(connect).not.toBeDisabled();
  expect(screen.queryByText("No key yet?")).toBeNull();
  fireEvent.click(connect);
  expect(onConnect).toHaveBeenCalledWith({ key: "aB3dEf9h", secret: "" });
  expect(localStorage.getItem("pr_setup_step_angel")).toBeNull();
});

test("'Start again' returns to step 1", () => {
  localStorage.setItem("pr_setup_step_angel", "4");
  setup();
  fireEvent.click(screen.getByText("Start again from Step 1"));
  expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
});
