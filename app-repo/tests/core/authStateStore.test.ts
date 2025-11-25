import { createDefaultAuthStateStore } from "../../src/core/auth/AuthStateStore";

async function run() {
  const store = createDefaultAuthStateStore();

  let observedStatus = store.getState().status;
  const unsubscribe = store.subscribe((state) => {
    observedStatus = state.status;
  });

  store.setState({ status: "authenticated", user: { id: "u1", displayName: "User", roles: [] } });

  if (observedStatus !== "authenticated") {
    throw new Error("AuthStateStore did not notify subscribers");
  }

  unsubscribe();

  store.setState({ status: "unauthenticated", user: null });

  console.log("authStateStore tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
