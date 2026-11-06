import { GET as getSharedStore, POST as postSharedStore } from "../server/shared-store.js";

export async function GET(request) {
  return getSharedStore(request);
}

export async function POST(request) {
  return postSharedStore(request);
}
