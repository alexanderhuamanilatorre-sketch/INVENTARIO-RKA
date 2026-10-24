import { AppCore } from "./app-core.js";
import { LayoutManager } from "./layout.js";

export async function initializeProtectedPage() {
  const appCore = new AppCore();
  const authorized = await appCore.initAuthGuard();
  if (!authorized) return false;

  new LayoutManager().init();
  return true;
}
