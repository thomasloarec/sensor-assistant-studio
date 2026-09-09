import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://x.invalid/" });
import { expect, test } from "bun:test";
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react";
function C() {
  const [v, setV] = React.useState("");
  return <input data-testid="i" value={v} onChange={(e) => setV(e.target.value)} />;
}
test("typing", async () => {
  const view = render(<C />);
  const el = view.getByTestId("i") as HTMLInputElement;
  await act(async () => { fireEvent.change(el, { target: { value: "abc" } }); });
  expect((view.getByTestId("i") as HTMLInputElement).value).toBe("abc");
});
