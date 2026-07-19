import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

// Full click-through: the app opens directly on question 1 -> answer questions
// -> reject the first guess -> accept the second -> land on the win screen.
// The engine uses an rng for question variety, so the walk is dynamic;
// termination is guaranteed by the engine's max-questions and max-rejects rules.
describe("Artemator UI", () => {
  it("opens straight into the first question", () => {
    render(<App />);
    expect(screen.getByText("Question 1")).toBeInTheDocument();
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-pose", "waiting");
    // all five answers are offered
    for (const label of ["Yes", "Probably", "Not sure", "Probably not", "No"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("plays a complete game through the real engine and catalog", () => {
    render(<App />);

    let rejected = false;
    let finished = false;
    for (let i = 0; i < 80 && !finished; i++) {
      if (screen.queryByRole("button", { name: "Play again" })) {
        finished = true;
        break;
      }
      const accept = screen.queryByRole("button", { name: "That's it" });
      if (accept) {
        expect(screen.getByTestId("mascot")).toHaveAttribute("data-pose", "reveal");
        if (!rejected) {
          rejected = true;
          fireEvent.click(screen.getByRole("button", { name: "No — keep looking" }));
        } else {
          fireEvent.click(accept);
        }
        continue;
      }
      const yes = screen.queryByRole("button", { name: "Yes" });
      if (yes) {
        fireEvent.click(yes);
        continue;
      }
      throw new Error("unexpected UI state: no question, guess, or end screen");
    }

    expect(finished).toBe(true);
    expect(rejected).toBe(true); // we exercised the reject-and-continue loop
    expect(
      screen.getByText(/Read you like a lookbook|My shortlist for you/)
    ).toBeInTheDocument();
    if (screen.getByText(/Read you like a lookbook/)) {
      expect(screen.getByRole("link", { name: "View product ↗" })).toHaveAttribute(
        "target",
        "_blank"
      );
      expect(
        screen.getByRole("link", { name: /View the product image/ })
      ).toHaveAttribute(
        "target",
        "_blank"
      );
    }
  });

  it("can be restarted after finishing", () => {
    render(<App />);
    let restarted = false;
    for (let i = 0; i < 80; i++) {
      const again = screen.queryByRole("button", { name: "Play again" });
      if (again) {
        fireEvent.click(again);
        restarted = true;
        break;
      }
      const accept = screen.queryByRole("button", { name: "That's it" });
      if (accept) fireEvent.click(accept);
      else fireEvent.click(screen.getByRole("button", { name: "No" }));
    }
    expect(restarted).toBe(true);
    // back on a fresh first question
    expect(screen.getByText("Question 1")).toBeInTheDocument();
  });
});
