import { useEffect, useState } from 'react';

import { fetchHealth } from './api';

export function App() {
  const [message, setMessage] = useState('Checking the API...');

  useEffect(() => {
    fetchHealth()
      .then((health) => setMessage(health.message))
      .catch(() => setMessage('The API is not reachable. Is the demo server running?'));
  }, []);

  return (
    <main>
      <h1>env-doctor demo</h1>
      <p>{message}</p>
    </main>
  );
}
