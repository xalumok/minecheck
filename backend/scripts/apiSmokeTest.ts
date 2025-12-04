/// <reference types="node" />
import 'dotenv/config';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000/api';
const email = 'test@test.com';
const password = process.env.TEST_USER_PASSWORD ?? 'TestPassword123!';

async function jsonFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  const auth = await jsonFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const token = auth.token as string;
  console.log('Logged in, token length:', token.length);

  const networks = await jsonFetch(`${API_BASE}/networks`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log('Networks:', networks.map((n: any) => ({ id: n.id, name: n.name })));

  if (networks.length === 0) {
    console.log('No networks found.');
    return;
  }

  const networkId = networks[0].id;
  const devices = await jsonFetch(`${API_BASE}/devices/network/${networkId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.dir(devices, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
