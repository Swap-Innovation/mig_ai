/** Demo mode — in-browser mock API for GitHub Pages static hosting. */
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "1" ||
  process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Fake JWT that passes looksLikeJwt() (3 segments). */
export const DEMO_TOKEN =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhcmNoaXRlY3RAZGVtby5sb2NhbCIsImRlbW8iOnRydWV9.bWlyYWdlLWRlbW8";

export const DEMO_USERS = [
  {
    email: "engineer@demo.local",
    password: "demo",
    role: "engineer",
    name: "Ellis Engineer",
  },
  {
    email: "architect@demo.local",
    password: "demo",
    role: "architect",
    name: "Alex Architect",
  },
  {
    email: "owner@demo.local",
    password: "demo",
    role: "product_owner",
    name: "Pat Product Owner",
  },
  {
    email: "dataowner@demo.local",
    password: "demo",
    role: "data_owner",
    name: "Dana Data Owner",
  },
  {
    email: "steward@demo.local",
    password: "demo",
    role: "data_steward",
    name: "Sam Steward",
  },
  {
    email: "board@demo.local",
    password: "demo",
    role: "change_board",
    name: "Casey Change Board",
  },
  {
    email: "viewer@demo.local",
    password: "demo",
    role: "viewer",
    name: "Vic Viewer",
  },
];
