import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

// Full click-through: start -> answer questions -> reject the first guess ->
// accept the second -> land on the win screen. The engine uses an rng for
// question variety, so the walk is dynamic; termination is guaranteed by the
// engine's max-questions and max-rejects rules.
describe("Artemator UI", () => {
  it("plays a complete game through the real engine and catalog", () => {
    render(<App />);

    // start screen
    expect(screen.getByText(/Artemator/i)).toBeInTheDocument();
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-pose", "idle");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

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
        // a question is on screen with all five answers
        expect(screen.getByRole("button", { name: "Not sure" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
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
  });

  it("can be restarted after finishing", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    for (let i = 0; i < 80; i++) {
      const again = screen.queryByRole("button", { name: "Play again" });
      if (again) {
        fireEvent.click(again);
        break;
      }
      const accept = screen.queryByRole("button", { name: "That's it" });
      if (accept) fireEvent.click(accept);
      else fireEvent.click(screen.getByRole("button", { name: "No" }));
    }
    // back on a fresh question
    expect(screen.getByText(/Question 1/)).toBeInTheDocument();
  });
});
