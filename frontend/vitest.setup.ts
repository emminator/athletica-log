import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
) as unknown as typeof fetch;
