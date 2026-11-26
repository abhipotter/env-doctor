export interface Health {
  message: string;
}

export async function fetchHealth(): Promise<Health> {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json();
}
